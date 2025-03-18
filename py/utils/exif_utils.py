import piexif
import json
import logging
from typing import Dict, Optional, Any
from io import BytesIO
from PIL import Image
import re

logger = logging.getLogger(__name__)

class ExifUtils:
    """Utility functions for working with EXIF data in images"""
    
    @staticmethod
    def extract_user_comment(image_path: str) -> Optional[str]:
        """Extract UserComment field from image EXIF data"""
        try:
            exif_dict = piexif.load(image_path)
            
            if piexif.ExifIFD.UserComment in exif_dict.get('Exif', {}):
                user_comment = exif_dict['Exif'][piexif.ExifIFD.UserComment]
                if isinstance(user_comment, bytes):
                    if user_comment.startswith(b'UNICODE\0'):
                        user_comment = user_comment[8:].decode('utf-16be')
                    else:
                        user_comment = user_comment.decode('utf-8', errors='ignore')
                return user_comment
            return None
        except Exception as e:
            logger.error(f"Error extracting EXIF data from {image_path}: {e}")
            return None
    
    @staticmethod
    def update_user_comment(image_path: str, user_comment: str) -> bool:
        """Update UserComment field in image EXIF data"""
        try:
            # Load the image and its EXIF data
            with Image.open(image_path) as img:
                exif_dict = piexif.load(img.info.get('exif', b''))
                
                # If no Exif dictionary exists, create one
                if 'Exif' not in exif_dict:
                    exif_dict['Exif'] = {}
                
                # Update the UserComment field - use UNICODE format
                unicode_bytes = user_comment.encode('utf-16be')
                user_comment_bytes = b'UNICODE\0' + unicode_bytes
                
                exif_dict['Exif'][piexif.ExifIFD.UserComment] = user_comment_bytes
                
                # Convert EXIF dict back to bytes
                exif_bytes = piexif.dump(exif_dict)
                
                # Save the image with updated EXIF data
                img.save(image_path, exif=exif_bytes)
                
            return True
        except Exception as e:
            logger.error(f"Error updating EXIF data in {image_path}: {e}")
            return False
    
    @staticmethod
    def parse_recipe_metadata(user_comment: str) -> Dict[str, Any]:
        """Parse recipe metadata from UserComment"""
        try:
            # Split by 'Negative prompt:' to get the prompt
            parts = user_comment.split('Negative prompt:', 1)
            prompt = parts[0].strip()
            
            # Initialize metadata with prompt
            metadata = {"prompt": prompt, "loras": [], "checkpoint": None}
            
            # Extract additional fields if available
            if len(parts) > 1:
                negative_and_params = parts[1]
                
                # Extract negative prompt
                if "Steps:" in negative_and_params:
                    neg_prompt = negative_and_params.split("Steps:", 1)[0].strip()
                    metadata["negative_prompt"] = neg_prompt
                
                # Extract key-value parameters (Steps, Sampler, CFG scale, etc.)
                param_pattern = r'([A-Za-z ]+): ([^,]+)'
                params = re.findall(param_pattern, negative_and_params)
                for key, value in params:
                    clean_key = key.strip().lower().replace(' ', '_')
                    metadata[clean_key] = value.strip()
            
            # Extract Civitai resources
            if 'Civitai resources:' in user_comment:
                resources_part = user_comment.split('Civitai resources:', 1)[1]
                if '],' in resources_part:
                    resources_json = resources_part.split('],', 1)[0] + ']'
                    try:
                        resources = json.loads(resources_json)
                        # Filter loras and checkpoints
                        for resource in resources:
                            if resource.get('type') == 'lora':
                                # 确保 weight 字段被正确保留
                                lora_entry = resource.copy()
                                # 如果找不到 weight，默认为 1.0
                                if 'weight' not in lora_entry:
                                    lora_entry['weight'] = 1.0
                                # Ensure modelVersionName is included
                                if 'modelVersionName' not in lora_entry:
                                    lora_entry['modelVersionName'] = ''
                                metadata['loras'].append(lora_entry)
                            elif resource.get('type') == 'checkpoint':
                                metadata['checkpoint'] = resource
                    except json.JSONDecodeError:
                        pass
            
            return metadata
        except Exception as e:
            logger.error(f"Error parsing recipe metadata: {e}")
            return {"prompt": user_comment, "loras": [], "checkpoint": None}
    
    @staticmethod
    def extract_recipe_metadata(user_comment: str) -> Optional[Dict]:
        """Extract recipe metadata section from UserComment if it exists"""
        try:
            # Look for recipe metadata section
            recipe_match = re.search(r'Recipe metadata: (\{.*\})', user_comment, re.IGNORECASE | re.DOTALL)
            if not recipe_match:
                return None
            
            recipe_json = recipe_match.group(1)
            return json.loads(recipe_json)
        except Exception as e:
            logger.error(f"Error extracting recipe metadata: {e}")
            return None
            
    @staticmethod
    def append_recipe_metadata(image_path: str, recipe_data: Dict) -> str:
        """Append recipe metadata to image EXIF data and return the path to the modified image"""
        try:
            # Extract existing user comment
            existing_comment = ExifUtils.extract_user_comment(image_path) or ""
            
            # Prepare recipe metadata to append
            recipe_metadata = {
                "title": recipe_data.get("title", ""),
                "base_model": recipe_data.get("base_model", ""),
                "loras": recipe_data.get("loras", []),
                "gen_params": recipe_data.get("gen_params", {}),
                "tags": recipe_data.get("tags", [])
            }
            
            # Convert to JSON string
            recipe_json = json.dumps(recipe_metadata, ensure_ascii=False)
            
            # Append to existing comment
            if existing_comment and not existing_comment.endswith("\n"):
                existing_comment += "\n"
            
            new_comment = existing_comment + "Recipe metadata: " + recipe_json
            
            # Update the image with new comment
            ExifUtils.update_user_comment(image_path, new_comment)
            
            return image_path
        except Exception as e:
            logger.error(f"Error appending recipe metadata: {e}")
            return image_path  # Return original path on error