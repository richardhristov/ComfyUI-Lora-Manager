from .py.lora_manager import LoraManager
from .py.nodes.lora_loader import LoraManagerLoader
from .py.nodes.trigger_word_toggle import TriggerWordToggle
from .py.nodes.lora_stacker import LoraStacker
# from .py.nodes.save_image import SaveImage

NODE_CLASS_MAPPINGS = {
    LoraManagerLoader.NAME: LoraManagerLoader,
    TriggerWordToggle.NAME: TriggerWordToggle,
    LoraStacker.NAME: LoraStacker,
    # SaveImage.NAME: SaveImage
}

WEB_DIRECTORY = "./web/comfyui"

# Register routes on import
LoraManager.add_routes()
__all__ = ['NODE_CLASS_MAPPINGS', 'WEB_DIRECTORY']
