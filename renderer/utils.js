export function mustElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing required element: ${id}`);
    }
    return element;
}
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
export function formatTime(isoString) {
    if (!isoString) {
        return '';
    }
    const date = new Date(isoString);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1)
        return 'just now';
    if (diffMins < 60)
        return `${diffMins}m ago`;
    if (diffHours < 24)
        return `${diffHours}h ago`;
    if (diffDays < 7)
        return `${diffDays}d ago`;
    return date.toLocaleDateString();
}
export function groupByDate(conversations) {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    for (const conversation of conversations) {
        const updatedAt = conversation.updated_at || conversation.created_at;
        const date = updatedAt ? new Date(updatedAt) : new Date(0);
        let label;
        if (date >= today)
            label = 'Today';
        else if (date >= yesterday)
            label = 'Yesterday';
        else if (date >= weekAgo)
            label = 'This Week';
        else
            label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!groups[label]) {
            groups[label] = [];
        }
        groups[label].push(conversation);
    }
    return groups;
}
export function showToast(message) {
    const existing = document.querySelector('.toast');
    existing?.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 2600);
}
