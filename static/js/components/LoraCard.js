import { showToast } from '../utils/uiHelpers.js';
import { state } from '../state/index.js';
import { showLoraModal } from './LoraModal.js';
import { bulkManager } from '../managers/BulkManager.js';

export function createLoraCard(lora) {
    const card = document.createElement('div');
    card.className = 'lora-card';
    card.dataset.sha256 = lora.sha256;
    card.dataset.filepath = lora.file_path;
    card.dataset.name = lora.model_name;
    card.dataset.file_name = lora.file_name;
    card.dataset.folder = lora.folder;
    card.dataset.modified = lora.modified;
    card.dataset.file_size = lora.file_size;
    card.dataset.from_civitai = lora.from_civitai;
    card.dataset.base_model = lora.base_model;
    card.dataset.usage_tips = lora.usage_tips;
    card.dataset.notes = lora.notes;
    card.dataset.meta = JSON.stringify(lora.civitai || {});
    
    // Store tags and model description
    if (lora.tags && Array.isArray(lora.tags)) {
        card.dataset.tags = JSON.stringify(lora.tags);
    }
    if (lora.modelDescription) {
        card.dataset.modelDescription = lora.modelDescription;
    }

    // Apply selection state if in bulk mode and this card is in the selected set
    if (state.bulkMode && state.selectedLoras.has(lora.file_path)) {
        card.classList.add('selected');
    }

    const version = state.previewVersions.get(lora.file_path);
    const previewUrl = lora.preview_url || '/loras_static/images/no-preview.png';
    const versionedPreviewUrl = version ? `${previewUrl}?t=${version}` : previewUrl;

    card.innerHTML = `
        <div class="card-preview">
            ${previewUrl.endsWith('.mp4') ? 
                `<video controls autoplay muted loop>
                    <source src="${versionedPreviewUrl}" type="video/mp4">
                </video>` :
                `<img src="${versionedPreviewUrl}" alt="${lora.model_name}">`
            }
            <div class="card-header">
                <span class="base-model-label" title="${lora.base_model}">
                    ${lora.base_model}
                </span>
                <div class="card-actions">
                    <i class="fas fa-globe" 
                       title="${lora.from_civitai ? 'View on Civitai' : 'Not available from Civitai'}"
                       ${!lora.from_civitai ? 'style="opacity: 0.5; cursor: not-allowed"' : ''}>
                    </i>
                    <i class="fas fa-copy" 
                       title="Copy LoRA Syntax">
                    </i>
                    <i class="fas fa-trash" 
                       title="Delete Model">
                    </i>
                </div>
            </div>
            <div class="card-footer">
                <div class="model-info">
                    <span class="model-name">${lora.model_name}</span>
                </div>
                <div class="card-actions">
                    <i class="fas fa-image" 
                       title="Replace Preview Image">
                    </i>
                </div>
            </div>
        </div>
    `;

    // Main card click event - modified to handle bulk mode
    card.addEventListener('click', () => {
        // Check if we're in bulk mode
        if (state.bulkMode) {
            // Toggle selection using the bulk manager
            bulkManager.toggleCardSelection(card);
        } else {
            // Normal behavior - show modal
            const loraMeta = {
                sha256: card.dataset.sha256,
                file_path: card.dataset.filepath,
                model_name: card.dataset.name,
                file_name: card.dataset.file_name,
                folder: card.dataset.folder,
                modified: card.dataset.modified,
                file_size: card.dataset.file_size,
                from_civitai: card.dataset.from_civitai === 'true',
                base_model: card.dataset.base_model,
                usage_tips: card.dataset.usage_tips,
                notes: card.dataset.notes,
                // Parse civitai metadata from the card's dataset
                civitai: (() => {
                    try {
                        // Attempt to parse the JSON string
                        return JSON.parse(card.dataset.meta || '{}');
                    } catch (e) {
                        console.error('Failed to parse civitai metadata:', e);
                        return {}; // Return empty object on error
                    }
                })(),
                tags: JSON.parse(card.dataset.tags || '[]'),
                modelDescription: card.dataset.modelDescription || ''
            };
            showLoraModal(loraMeta);
        }
    });

    // Copy button click event
    card.querySelector('.fa-copy')?.addEventListener('click', async e => {
        e.stopPropagation();
        const usageTips = JSON.parse(card.dataset.usage_tips || '{}');
        const strength = usageTips.strength || 1;
        const loraSyntax = `<lora:${card.dataset.file_name}:${strength}>`;
        
        try {
            // Modern clipboard API
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(loraSyntax);
            } else {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = loraSyntax;
                textarea.style.position = 'absolute';
                textarea.style.left = '-99999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            showToast('LoRA syntax copied', 'success');
        } catch (err) {
            console.error('Copy failed:', err);
            showToast('Copy failed', 'error');
        }
    });

    // Civitai button click event
    if (lora.from_civitai) {
        card.querySelector('.fa-globe')?.addEventListener('click', e => {
            e.stopPropagation();
            openCivitai(lora.model_name);
        });
    }

    // Delete button click event
    card.querySelector('.fa-trash')?.addEventListener('click', e => {
        e.stopPropagation();
        deleteModel(lora.file_path);
    });

    // Replace preview button click event
    card.querySelector('.fa-image')?.addEventListener('click', e => {
        e.stopPropagation();
        replacePreview(lora.file_path);
    });
    
    // Apply bulk mode styling if currently in bulk mode
    if (state.bulkMode) {
        const actions = card.querySelectorAll('.card-actions');
        actions.forEach(actionGroup => {
            actionGroup.style.display = 'none';
        });
    }

    return card;
}

// Add a method to update card appearance based on bulk mode
export function updateCardsForBulkMode(isBulkMode) {
    // Update the state
    state.bulkMode = isBulkMode;
    
    document.body.classList.toggle('bulk-mode', isBulkMode);
    
    // Get all lora cards
    const loraCards = document.querySelectorAll('.lora-card');
    
    loraCards.forEach(card => {
        // Get all action containers for this card
        const actions = card.querySelectorAll('.card-actions');
        
        // Handle display property based on mode
        if (isBulkMode) {
            // Hide actions when entering bulk mode
            actions.forEach(actionGroup => {
                actionGroup.style.display = 'none';
            });
        } else {
            // Ensure actions are visible when exiting bulk mode
            actions.forEach(actionGroup => {
                // We need to reset to default display style which is flex
                actionGroup.style.display = 'flex';
            });
        }
    });
    
    // Apply selection state to cards if entering bulk mode
    if (isBulkMode) {
        bulkManager.applySelectionState();
    }
}