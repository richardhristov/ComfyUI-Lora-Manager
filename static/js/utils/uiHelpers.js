import { state } from '../state/index.js';
import { resetAndReload } from '../api/loraApi.js';

export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.append(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
        setTimeout(() => toast.remove(), 2300);
    });
}

export function lazyLoadImages() {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.target.dataset.src) {
                entry.target.src = entry.target.dataset.src;
                observer.unobserve(entry.target);
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
}

export function restoreFolderFilter() {
    const activeFolder = localStorage.getItem('activeFolder');
    const folderTag = activeFolder && document.querySelector(`.tag[data-folder="${activeFolder}"]`);
    if (folderTag) {
        folderTag.classList.add('active');
        filterByFolder(activeFolder);
    }
}

export function initTheme() {
    document.body.dataset.theme = localStorage.getItem('theme') || 'dark';
}

export function toggleTheme() {
    const theme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
}

export function toggleFolder(tag) {
    const tagElement = (tag instanceof HTMLElement) ? tag : this;
    const folder = tagElement.dataset.folder;
    const wasActive = tagElement.classList.contains('active');
    
    document.querySelectorAll('.folder-tags .tag').forEach(t => {
        t.classList.remove('active');
    });
    
    if (!wasActive) {
        tagElement.classList.add('active');
        state.activeFolder = folder;
    } else {
        state.activeFolder = null;
    }
    
    resetAndReload();
}

export function copyTriggerWord(word) {
    navigator.clipboard.writeText(word).then(() => {
        const toast = document.createElement('div');
        toast.className = 'toast toast-copy';
        toast.textContent = 'Copied!';
        document.body.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 1000);
        });
    });
}

function filterByFolder(folderPath) {
    document.querySelectorAll('.lora-card').forEach(card => {
        card.style.display = card.dataset.folder === folderPath ? '' : 'none';
    });
} 