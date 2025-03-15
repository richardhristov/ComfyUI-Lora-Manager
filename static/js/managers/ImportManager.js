import { modalManager } from './ModalManager.js';
import { showToast } from '../utils/uiHelpers.js';
import { LoadingManager } from './LoadingManager.js';
import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';

export class ImportManager {
    constructor() {
        this.recipeImage = null;
        this.recipeData = null;
        this.recipeName = '';
        this.recipeTags = [];
        this.missingLoras = [];
        
        // Add initialization check
        this.initialized = false;
        this.selectedFolder = '';

        // Add LoadingManager instance
        this.loadingManager = new LoadingManager();
        this.folderClickHandler = null;
        this.updateTargetPath = this.updateTargetPath.bind(this);
        
        // 添加对注入样式的引用
        this.injectedStyles = null;
    }

    showImportModal() {
        if (!this.initialized) {
            // Check if modal exists
            const modal = document.getElementById('importModal');
            if (!modal) {
                console.error('Import modal element not found');
                return;
            }
            this.initialized = true;
        }
        
        // Always reset the state when opening the modal
        this.resetSteps();
        
        // Show the modal
        modalManager.showModal('importModal', null, () => {
            // Cleanup handler when modal closes
            this.cleanupFolderBrowser();
            
            // Remove any injected styles
            this.removeInjectedStyles();
        });
        
        // Verify the modal is properly shown
        setTimeout(() => {
            this.ensureModalVisible();
        }, 50);
    }

    // 添加移除注入样式的方法
    removeInjectedStyles() {
        if (this.injectedStyles && this.injectedStyles.parentNode) {
            this.injectedStyles.parentNode.removeChild(this.injectedStyles);
            this.injectedStyles = null;
        }
        
        // Also reset any inline styles that might have been set with !important
        document.querySelectorAll('.import-step').forEach(step => {
            step.style.cssText = '';
        });
    }

    resetSteps() {
        // Remove any existing injected styles
        this.removeInjectedStyles();
        
        // Show the first step
        this.showStep('uploadStep');
        
        // Reset file input
        const fileInput = document.getElementById('recipeImageUpload');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Reset error message
        const errorElement = document.getElementById('uploadError');
        if (errorElement) {
            errorElement.textContent = '';
        }
        
        // Reset preview
        const previewElement = document.getElementById('imagePreview');
        if (previewElement) {
            previewElement.innerHTML = '<div class="placeholder">Image preview will appear here</div>';
        }
        
        // Reset recipe name input
        const recipeName = document.getElementById('recipeName');
        if (recipeName) {
            recipeName.value = '';
        }
        
        // Reset tags container
        const tagsContainer = document.getElementById('tagsContainer');
        if (tagsContainer) {
            tagsContainer.innerHTML = '<div class="empty-tags">No tags added</div>';
        }
        
        // Reset state variables
        this.recipeImage = null;
        this.recipeData = null;
        this.recipeName = '';
        this.recipeTags = [];
        this.missingLoras = [];
        
        // Clear selected folder and remove selection from UI
        this.selectedFolder = '';
        const folderBrowser = document.getElementById('importFolderBrowser');
        if (folderBrowser) {
            folderBrowser.querySelectorAll('.folder-item').forEach(f => 
                f.classList.remove('selected'));
        }
        
        // Clear missing LoRAs list if it exists
        const missingLorasList = document.getElementById('missingLorasList');
        if (missingLorasList) {
            missingLorasList.innerHTML = '';
        }
        
        // Reset total download size
        const totalSizeDisplay = document.getElementById('totalDownloadSize');
        if (totalSizeDisplay) {
            totalSizeDisplay.textContent = 'Calculating...';
        }
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        const errorElement = document.getElementById('uploadError');
        
        if (!file) {
            return;
        }
        
        // Validate file type
        if (!file.type.match('image.*')) {
            errorElement.textContent = 'Please select an image file';
            return;
        }
        
        // Reset error
        errorElement.textContent = '';
        this.recipeImage = file;
        
        // Auto-proceed to next step if file is selected
        this.uploadAndAnalyzeImage();
    }

    async uploadAndAnalyzeImage() {
        if (!this.recipeImage) {
            showToast('Please select an image first', 'error');
            return;
        }
        
        try {
            this.loadingManager.showSimpleLoading('Analyzing image metadata...');
            
            // Create form data for upload
            const formData = new FormData();
            formData.append('image', this.recipeImage);
            
            // Upload image for analysis
            const response = await fetch('/api/recipes/analyze-image', {
                method: 'POST',
                body: formData
            });
            
            // Get recipe data from response
            this.recipeData = await response.json();
            
            // Check if we have an error message
            if (this.recipeData.error) {
                throw new Error(this.recipeData.error);
            }
            
            // Check if we have valid recipe data
            if (!this.recipeData || !this.recipeData.loras || this.recipeData.loras.length === 0) {
                throw new Error('No LoRA information found in this image');
            }
            
            // Find missing LoRAs
            this.missingLoras = this.recipeData.loras.filter(lora => !lora.existsLocally);
            
            // Proceed to recipe details step
            this.showRecipeDetailsStep();
            
        } catch (error) {
            document.getElementById('uploadError').textContent = error.message;
        } finally {
            this.loadingManager.hide();
        }
    }

    showRecipeDetailsStep() {
        this.showStep('detailsStep');
        
        // Set default recipe name from image filename
        const recipeName = document.getElementById('recipeName');
        if (this.recipeImage && !recipeName.value) {
            const fileName = this.recipeImage.name.split('.')[0];
            recipeName.value = fileName;
            this.recipeName = fileName;
        }
        
        // Display the uploaded image in the preview
        const imagePreview = document.getElementById('recipeImagePreview');
        if (imagePreview && this.recipeImage) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.innerHTML = `<img src="${e.target.result}" alt="Recipe preview">`;
            };
            reader.readAsDataURL(this.recipeImage);
        }
        
        // Update LoRA count information
        const totalLoras = this.recipeData.loras.length;
        const existingLoras = this.recipeData.loras.filter(lora => lora.existsLocally).length;
        const loraCountInfo = document.getElementById('loraCountInfo');
        if (loraCountInfo) {
            loraCountInfo.textContent = `(${existingLoras}/${totalLoras} in library)`;
        }
        
        // Display LoRAs list
        const lorasList = document.getElementById('lorasList');
        if (lorasList) {
            lorasList.innerHTML = this.recipeData.loras.map(lora => {
                const existsLocally = lora.existsLocally;
                const localPath = lora.localPath || '';
                
                // Create local status badge
                const localStatus = existsLocally ? 
                    `<div class="local-badge">
                        <i class="fas fa-check"></i> In Library
                        <div class="local-path">${localPath}</div>
                     </div>` : 
                    `<div class="missing-badge">
                        <i class="fas fa-exclamation-triangle"></i> Not in Library
                     </div>`;

                // Format size if available
                const sizeDisplay = lora.size ? 
                    `<div class="size-badge">${this.formatFileSize(lora.size)}</div>` : '';

                return `
                    <div class="lora-item ${existsLocally ? 'exists-locally' : 'missing-locally'}">
                        <div class="lora-thumbnail">
                            <img src="${lora.thumbnailUrl || '/loras_static/images/no-preview.png'}" alt="LoRA preview">
                        </div>
                        <div class="lora-content">
                            <div class="lora-header">
                                <h3>${lora.name}</h3>
                                ${localStatus}
                            </div>
                            ${lora.version ? `<div class="lora-version">${lora.version}</div>` : ''}
                            <div class="lora-info">
                                ${lora.baseModel ? `<div class="base-model">${lora.baseModel}</div>` : ''}
                                ${sizeDisplay}
                                <div class="weight-badge">Weight: ${lora.weight || 1.0}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // Update Next button state based on missing LoRAs
        this.updateNextButtonState();
    }
    
    updateNextButtonState() {
        const nextButton = document.querySelector('#detailsStep .primary-btn');
        if (!nextButton) return;
        
        // If we have missing LoRAs, show "Download Missing LoRAs"
        // Otherwise show "Save Recipe"
        if (this.missingLoras.length > 0) {
            nextButton.textContent = 'Download Missing LoRAs';
        } else {
            nextButton.textContent = 'Save Recipe';
        }
    }

    handleRecipeNameChange(event) {
        this.recipeName = event.target.value.trim();
    }

    addTag() {
        const tagInput = document.getElementById('tagInput');
        const tag = tagInput.value.trim();
        
        if (!tag) return;
        
        if (!this.recipeTags.includes(tag)) {
            this.recipeTags.push(tag);
            this.updateTagsDisplay();
        }
        
        tagInput.value = '';
    }
    
    removeTag(tag) {
        this.recipeTags = this.recipeTags.filter(t => t !== tag);
        this.updateTagsDisplay();
    }
    
    updateTagsDisplay() {
        const tagsContainer = document.getElementById('tagsContainer');
        
        if (this.recipeTags.length === 0) {
            tagsContainer.innerHTML = '<div class="empty-tags">No tags added</div>';
            return;
        }
        
        tagsContainer.innerHTML = this.recipeTags.map(tag => `
            <div class="recipe-tag">
                ${tag}
                <i class="fas fa-times" onclick="importManager.removeTag('${tag}')"></i>
            </div>
        `).join('');
    }

    proceedFromDetails() {
        // Validate recipe name
        if (!this.recipeName) {
            showToast('Please enter a recipe name', 'error');
            return;
        }
        
        // If we have missing LoRAs, go to location step
        if (this.missingLoras.length > 0) {
            this.proceedToLocation();
        } else {
            // Otherwise, save the recipe directly
            this.saveRecipe();
        }
    }

    async proceedToLocation() {
        
        // Show the location step with special handling
        this.showStep('locationStep');
        
        // Double-check after a short delay to ensure the step is visible
        setTimeout(() => {
            const locationStep = document.getElementById('locationStep');
            if (locationStep.style.display !== 'block' || 
                window.getComputedStyle(locationStep).display !== 'block') {
                // Force display again
                locationStep.style.display = 'block';
                
                // If still not visible, try with injected style
                if (window.getComputedStyle(locationStep).display !== 'block') {
                    this.injectedStyles = document.createElement('style');
                    this.injectedStyles.innerHTML = `
                        #locationStep {
                            display: block !important;
                            opacity: 1 !important;
                            visibility: visible !important;
                        }
                    `;
                    document.head.appendChild(this.injectedStyles);
                }
            }
        }, 100);
        
        try {
            // Display missing LoRAs that will be downloaded
            const missingLorasList = document.getElementById('missingLorasList');
            if (missingLorasList && this.missingLoras.length > 0) {
                // Calculate total size
                const totalSize = this.missingLoras.reduce((sum, lora) => {
                    return sum + (lora.size ? parseInt(lora.size) : 0);
                }, 0);
                
                // Update total size display
                const totalSizeDisplay = document.getElementById('totalDownloadSize');
                if (totalSizeDisplay) {
                    totalSizeDisplay.textContent = this.formatFileSize(totalSize);
                }
                
                // Generate missing LoRAs list
                missingLorasList.innerHTML = this.missingLoras.map(lora => {
                    const sizeDisplay = lora.size ? this.formatFileSize(lora.size) : 'Unknown size';
                    
                    return `
                        <div class="missing-lora-item">
                            <div class="missing-lora-name">${lora.name}</div>
                            <div class="missing-lora-size">${sizeDisplay}</div>
                        </div>
                    `;
                }).join('');
            }
            
            // Fetch LoRA roots
            const rootsResponse = await fetch('/api/lora-roots');
            if (!rootsResponse.ok) {
                throw new Error(`Failed to fetch LoRA roots: ${rootsResponse.status}`);
            }
            
            const rootsData = await rootsResponse.json();
            const loraRoot = document.getElementById('importLoraRoot');
            if (loraRoot) {
                loraRoot.innerHTML = rootsData.roots.map(root => 
                    `<option value="${root}">${root}</option>`
                ).join('');
            }
            
            // Fetch folders
            const foldersResponse = await fetch('/api/folders');
            if (!foldersResponse.ok) {
                throw new Error(`Failed to fetch folders: ${foldersResponse.status}`);
            }
            
            const foldersData = await foldersResponse.json();
            const folderBrowser = document.getElementById('importFolderBrowser');
            if (folderBrowser) {
                folderBrowser.innerHTML = foldersData.folders.map(folder => 
                    folder ? `<div class="folder-item" data-folder="${folder}">${folder}</div>` : ''
                ).join('');
            }

            // Initialize folder browser after loading data
            this.initializeFolderBrowser();
        } catch (error) {
            console.error('Error in API calls:', error);
            showToast(error.message, 'error');
        }
    }

    backToUpload() {
        this.showStep('uploadStep');
        
        // Reset file input to ensure it can trigger change events again
        const fileInput = document.getElementById('recipeImageUpload');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Clear any previous error messages
        const errorElement = document.getElementById('uploadError');
        if (errorElement) {
            errorElement.textContent = '';
        }
    }

    backToDetails() {
        this.showStep('detailsStep');
    }

    async saveRecipe() {
        if (!this.recipeName) {
            showToast('Please enter a recipe name', 'error');
            return;
        }
        
        try {
            // First save the recipe
            this.loadingManager.showSimpleLoading('Saving recipe...');
            
            // Create form data for save request
            const formData = new FormData();
            formData.append('image', this.recipeImage);
            formData.append('name', this.recipeName);
            formData.append('tags', JSON.stringify(this.recipeTags));
            formData.append('metadata', JSON.stringify(this.recipeData));
            
            // Send save request
            const response = await fetch('/api/recipes/save', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            if (result.success) {
                // Handle successful save
                // Show success message for recipe save
                showToast(`Recipe "${this.recipeName}" saved successfully`, 'success');
                
                // Check if we need to download LoRAs
                if (this.missingLoras.length > 0) {
                    // For download, we need to validate the target path
                    const loraRoot = document.getElementById('importLoraRoot')?.value;
                    if (!loraRoot) {
                        throw new Error('Please select a LoRA root directory');
                    }
                    
                    // Build target path
                    let targetPath = loraRoot;
                    if (this.selectedFolder) {
                        targetPath += '/' + this.selectedFolder;
                    }
                    
                    const newFolder = document.getElementById('importNewFolder')?.value?.trim();
                    if (newFolder) {
                        targetPath += '/' + newFolder;
                    }
                    
                    // Set up WebSocket for progress updates
                    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
                    const ws = new WebSocket(`${wsProtocol}${window.location.host}/ws/fetch-progress`);
                    
                    // Download missing LoRAs sequentially
                    this.loadingManager.show('Downloading LoRAs...', 0);
                    
                    let completedDownloads = 0;
                    for (let i = 0; i < this.missingLoras.length; i++) {
                        const lora = this.missingLoras[i];
                        
                        // Update overall progress
                        this.loadingManager.setStatus(`Downloading LoRA ${i+1}/${this.missingLoras.length}: ${lora.name}`);
                        
                        // Set up progress tracking for current download
                        ws.onmessage = (event) => {
                            const data = JSON.parse(event.data);
                            if (data.status === 'progress') {
                                // Calculate overall progress: completed files + current file progress
                                const overallProgress = Math.floor(
                                    (completedDownloads + data.progress/100) / this.missingLoras.length * 100
                                );
                                this.loadingManager.setProgress(overallProgress);
                            }
                        };
                        
                        try {
                            // Download the LoRA
                            const response = await fetch('/api/download-lora', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    download_url: lora.downloadUrl,
                                    lora_root: loraRoot,
                                    relative_path: targetPath.replace(loraRoot + '/', '')
                                })
                            });
                            
                            if (!response.ok) {
                                const errorText = await response.text();
                                console.error(`Failed to download LoRA ${lora.name}: ${errorText}`);
                                // Continue with next download
                            } else {
                                completedDownloads++;
                            }
                        } catch (downloadError) {
                            console.error(`Error downloading LoRA ${lora.name}:`, downloadError);
                            // Continue with next download
                        }
                    }
                    
                    // Close WebSocket
                    ws.close();
                    
                    // Show final completion message
                    if (completedDownloads === this.missingLoras.length) {
                        showToast(`All ${completedDownloads} LoRAs downloaded successfully`, 'success');
                    } else {
                        showToast(`Downloaded ${completedDownloads} of ${this.missingLoras.length} LoRAs`, 'warning');
                    }
                }
                
                // Close modal and reload recipes
                modalManager.closeModal('importModal');
                
                // Refresh the recipe list if needed
                if (typeof refreshRecipes === 'function') {
                    refreshRecipes();
                } else {
                    // Fallback to reloading the page
                    resetAndReload();
                }
                
            } else {
                // Handle error
                console.error(`Failed to save recipe: ${result.error}`);
                // Show error message to user
                showToast(result.error, 'error');
            }
            
        } catch (error) {
            console.error('Error saving recipe:', error);
            showToast(error.message, 'error');
        } finally {
            this.loadingManager.hide();
        }
    }

    initializeFolderBrowser() {
        const folderBrowser = document.getElementById('importFolderBrowser');
        if (!folderBrowser) return;

        // Cleanup existing handler if any
        this.cleanupFolderBrowser();

        // Create new handler
        this.folderClickHandler = (event) => {
            const folderItem = event.target.closest('.folder-item');
            if (!folderItem) return;

            if (folderItem.classList.contains('selected')) {
                folderItem.classList.remove('selected');
                this.selectedFolder = '';
            } else {
                folderBrowser.querySelectorAll('.folder-item').forEach(f => 
                    f.classList.remove('selected'));
                folderItem.classList.add('selected');
                this.selectedFolder = folderItem.dataset.folder;
            }
            
            // Update path display after folder selection
            this.updateTargetPath();
        };

        // Add the new handler
        folderBrowser.addEventListener('click', this.folderClickHandler);
        
        // Add event listeners for path updates
        const loraRoot = document.getElementById('importLoraRoot');
        const newFolder = document.getElementById('importNewFolder');
        
        if (loraRoot) loraRoot.addEventListener('change', this.updateTargetPath);
        if (newFolder) newFolder.addEventListener('input', this.updateTargetPath);
        
        // Update initial path
        this.updateTargetPath();
    }

    cleanupFolderBrowser() {
        if (this.folderClickHandler) {
            const folderBrowser = document.getElementById('importFolderBrowser');
            if (folderBrowser) {
                folderBrowser.removeEventListener('click', this.folderClickHandler);
                this.folderClickHandler = null;
            }
        }
        
        // Remove path update listeners
        const loraRoot = document.getElementById('importLoraRoot');
        const newFolder = document.getElementById('importNewFolder');
        
        if (loraRoot) loraRoot.removeEventListener('change', this.updateTargetPath);
        if (newFolder) newFolder.removeEventListener('input', this.updateTargetPath);
    }
    
    updateTargetPath() {
        const pathDisplay = document.getElementById('importTargetPathDisplay');
        if (!pathDisplay) return;
        
        const loraRoot = document.getElementById('importLoraRoot')?.value || '';
        const newFolder = document.getElementById('importNewFolder')?.value?.trim() || '';
        
        let fullPath = loraRoot || 'Select a LoRA root directory'; 
        
        if (loraRoot) {
            if (this.selectedFolder) {
                fullPath += '/' + this.selectedFolder;
            }
            if (newFolder) {
                fullPath += '/' + newFolder;
            }
        }
    
        pathDisplay.innerHTML = `<span class="path-text">${fullPath}</span>`;
    }

    showStep(stepId) {
        
        // First, remove any injected styles to prevent conflicts
        this.removeInjectedStyles();
        
        // Hide all steps first
        document.querySelectorAll('.import-step').forEach(step => {
            step.style.display = 'none';
        });
        
        // Show target step with a monitoring mechanism
        const targetStep = document.getElementById(stepId);
        if (targetStep) {
            // Use direct style setting
            targetStep.style.display = 'block';
            
            // For the locationStep specifically, we need additional measures
            if (stepId === 'locationStep') {
                // Create a more persistent style to override any potential conflicts
                this.injectedStyles = document.createElement('style');
                this.injectedStyles.innerHTML = `
                    #locationStep {
                        display: block !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                    }
                `;
                document.head.appendChild(this.injectedStyles);
                
                // Force layout recalculation
                targetStep.offsetHeight;
                
                // Set up a monitor to ensure the step remains visible
                setTimeout(() => {
                    if (targetStep.style.display !== 'block') {
                        targetStep.style.display = 'block';
                    }
                    
                    // Check dimensions again after a short delay
                    const newRect = targetStep.getBoundingClientRect();
                }, 50);
            }
            
            // Scroll modal content to top
            const modalContent = document.querySelector('#importModal .modal-content');
            if (modalContent) {
                modalContent.scrollTop = 0;
            }
        }
    }

    // Add a helper method to format file sizes
    formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '';
        
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
    }

    // Add this method to ensure the modal is fully visible and initialized
    ensureModalVisible() {
        const importModal = document.getElementById('importModal');
        if (!importModal) {
            console.error('Import modal element not found');
            return false;
        }
        
        // Check if modal is actually visible
        const modalDisplay = window.getComputedStyle(importModal).display;
        if (modalDisplay !== 'block') {
            console.error('Import modal is not visible, display: ' + modalDisplay);
            return false;
        }
        
        return true;
    }
} 