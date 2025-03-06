from typing import Dict, Optional
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class LoraHashIndex:
    """Index for mapping LoRA file hashes to their file paths"""
    
    def __init__(self):
        self._hash_to_path: Dict[str, str] = {}
        
    def add_entry(self, sha256: str, file_path: str) -> None:
        """Add or update a hash -> path mapping"""
        if not sha256 or not file_path:
            return
        self._hash_to_path[sha256] = file_path
        
    def remove_entry(self, sha256: str) -> None:
        """Remove a hash entry"""
        self._hash_to_path.pop(sha256, None)
        
    def remove_by_path(self, file_path: str) -> None:
        """Remove entry by file path"""
        for sha256, path in list(self._hash_to_path.items()):
            if path == file_path:
                del self._hash_to_path[sha256]
                break
                
    def get_path(self, sha256: str) -> Optional[str]:
        """Get file path for a given hash"""
        return self._hash_to_path.get(sha256)
        
    def get_hash(self, file_path: str) -> Optional[str]:
        """Get hash for a given file path"""
        for sha256, path in self._hash_to_path.items():
            if path == file_path:
                return sha256
        return None
        
    def has_hash(self, sha256: str) -> bool:
        """Check if hash exists in index"""
        return sha256 in self._hash_to_path
        
    def clear(self) -> None:
        """Clear all entries"""
        self._hash_to_path.clear() 