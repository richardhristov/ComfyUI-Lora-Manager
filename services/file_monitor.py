from operator import itemgetter
import os
import logging
import asyncio
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileDeletedEvent
from typing import List
from threading import Lock
from .lora_scanner import LoraScanner
import platform
from ..config import config

logger = logging.getLogger(__name__)

class LoraFileHandler(FileSystemEventHandler):
    """Handler for LoRA file system events"""
    
    def __init__(self, scanner: LoraScanner, loop: asyncio.AbstractEventLoop):
        self.scanner = scanner
        self.loop = loop  # 存储事件循环引用
        self.pending_changes = set()  # 待处理的变更
        self.lock = Lock()  # 线程安全锁
        self.update_task = None  # 异步更新任务
        self._ignore_paths = set()  # Add ignore paths set
        self._min_ignore_timeout = 5  # minimum timeout in seconds
        self._download_speed = 1024 * 1024  # assume 1MB/s as base speed

    def _should_ignore(self, path: str) -> bool:
        """Check if path should be ignored"""
        logger.info(f"Checking ignore for {path}")
        logger.info(f"Current ignore paths: {self._ignore_paths}")
        real_path = os.path.realpath(path)  # Resolve any symbolic links
        return real_path.replace(os.sep, '/') in self._ignore_paths

    def add_ignore_path(self, path: str, file_size: int = 0):
        """Add path to ignore list with dynamic timeout based on file size"""
        real_path = os.path.realpath(path)  # Resolve any symbolic links
        self._ignore_paths.add(real_path.replace(os.sep, '/'))
        
        # Calculate timeout based on file size, with a minimum value
        # Assuming average download speed of 1MB/s
        timeout = max(
            self._min_ignore_timeout,
            (file_size / self._download_speed) * 1.5  # Add 50% buffer
        )
        
        logger.debug(f"Adding {real_path} to ignore list for {timeout:.1f} seconds")
        
        asyncio.get_event_loop().call_later(
            timeout,
            self._ignore_paths.discard,
            real_path.replace(os.sep, '/')
        )
        
    def on_created(self, event):
        if event.is_directory or not event.src_path.endswith('.safetensors'):
            return
        if self._should_ignore(event.src_path):
            return
        logger.info(f"LoRA file created: {event.src_path}")
        self._schedule_update('add', event.src_path)

    def on_deleted(self, event):
        if event.is_directory or not event.src_path.endswith('.safetensors'):
            return
        if self._should_ignore(event.src_path):
            return
        logger.info(f"LoRA file deleted: {event.src_path}")
        self._schedule_update('remove', event.src_path)
        
    def _schedule_update(self, action: str, file_path: str): #file_path is a real path
        """Schedule a cache update"""
        with self.lock:
            # 使用 config 中的方法映射路径
            mapped_path = config.map_path_to_link(file_path)
            normalized_path = mapped_path.replace(os.sep, '/')
            self.pending_changes.add((action, normalized_path))
            
            self.loop.call_soon_threadsafe(self._create_update_task)

    def _create_update_task(self):
        """Create update task in the event loop"""
        if self.update_task is None or self.update_task.done():
            self.update_task = asyncio.create_task(self._process_changes())

    async def _process_changes(self, delay: float = 2.0):
        """Process pending changes with debouncing"""
        await asyncio.sleep(delay)
        
        try:
            with self.lock:
                changes = self.pending_changes.copy()
                self.pending_changes.clear()
            
            if not changes:
                return
            
            
            logger.info(f"Processing {len(changes)} file changes")

            cache = await self.scanner.get_cached_data()  # 先完成可能的初始化
            needs_resort = False
            new_folders = set()  # 用于收集新的文件夹
            
            for action, file_path in changes:
                try:
                    if action == 'add':
                        # 扫描新文件
                        lora_data = await self.scanner.scan_single_lora(file_path)
                        if lora_data:
                            cache.raw_data.append(lora_data)
                            new_folders.add(lora_data['folder'])  # 收集新文件夹
                            needs_resort = True
                            
                    elif action == 'remove':
                        # 从缓存中移除
                        logger.info(f"Removing {file_path} from cache")
                        cache.raw_data = [
                            item for item in cache.raw_data 
                            if item['file_path'] != file_path
                        ]
                        needs_resort = True
                        
                except Exception as e:
                    logger.error(f"Error processing {action} for {file_path}: {e}")
            
            if needs_resort:
                await cache.resort()
                
                # 更新文件夹列表，包括新添加的文件夹
                all_folders = set(cache.folders) | new_folders
                cache.folders = sorted(list(all_folders), key=lambda x: x.lower())
                
        except Exception as e:
            logger.error(f"Error in process_changes: {e}")


class LoraFileMonitor:
    """Monitor for LoRA file changes"""
    
    def __init__(self, scanner: LoraScanner, roots: List[str]):
        self.scanner = scanner
        scanner.set_file_monitor(self)
        self.observer = Observer()
        self.loop = asyncio.get_event_loop()
        self.handler = LoraFileHandler(scanner, self.loop)
        
        # 使用已存在的路径映射
        self.monitor_paths = set()
        for root in roots:
            self.monitor_paths.add(os.path.realpath(root).replace(os.sep, '/'))

        # 添加所有已映射的目标路径
        for target_path in config._path_mappings.keys():
            self.monitor_paths.add(target_path)

    def start(self):
        """Start monitoring"""
        for path_info in self.monitor_paths:
            try:
                if isinstance(path_info, tuple):
                    # 对于链接，监控目标路径
                    _, target_path = path_info
                    self.observer.schedule(self.handler, target_path, recursive=True)
                    logger.info(f"Started monitoring target path: {target_path}")
                else:
                    # 对于普通路径，直接监控
                    self.observer.schedule(self.handler, path_info, recursive=True)
                    logger.info(f"Started monitoring: {path_info}")
            except Exception as e:
                logger.error(f"Error monitoring {path_info}: {e}")
                
        self.observer.start()
        
    def stop(self):
        """Stop monitoring"""
        self.observer.stop()
        self.observer.join()

    def rescan_links(self):
        """重新扫描链接（当添加新的链接时调用）"""
        new_paths = set()
        for path in self.monitor_paths.copy():
            self._add_link_targets(path)
        
        # 添加新发现的路径到监控
        new_paths = self.monitor_paths - set(self.observer.watches.keys())
        for path in new_paths:
            try:
                self.observer.schedule(self.handler, path, recursive=True)
                logger.info(f"Added new monitoring path: {path}")
            except Exception as e:
                logger.error(f"Error adding new monitor for {path}: {e}")