import asyncio
from typing import List, Dict
from dataclasses import dataclass
from operator import itemgetter

@dataclass
class RecipeCache:
    """Cache structure for Recipe data"""
    raw_data: List[Dict]
    sorted_by_name: List[Dict]
    sorted_by_date: List[Dict]
    
    def __post_init__(self):
        self._lock = asyncio.Lock()

    async def resort(self, name_only: bool = False):
        """Resort all cached data views"""
        async with self._lock:
            self.sorted_by_name = sorted(
                self.raw_data, 
                key=lambda x: x.get('title', '').lower()  # Case-insensitive sort
            )
            if not name_only:
                self.sorted_by_date = sorted(
                    self.raw_data, 
                    key=itemgetter('created_date', 'file_path'), 
                    reverse=True
                )
    
    async def update_recipe_metadata(self, recipe_id: str, metadata: Dict) -> bool:
        """Update metadata for a specific recipe in all cached data
        
        Args:
            recipe_id: The ID of the recipe to update
            metadata: The new metadata
            
        Returns:
            bool: True if the update was successful, False if the recipe wasn't found
        """
        async with self._lock:
            # Update in raw_data
            for item in self.raw_data:
                if item.get('id') == recipe_id:
                    item.update(metadata)
                    break
            else:
                return False  # Recipe not found
                
            # Resort to reflect changes
            await self.resort()
            return True
            
    async def add_recipe(self, recipe_data: Dict) -> None:
        """Add a new recipe to the cache
        
        Args:
            recipe_data: The recipe data to add
        """
        async with self._lock:
            self.raw_data.append(recipe_data)
            await self.resort() 