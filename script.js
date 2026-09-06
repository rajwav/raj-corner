const now = new Date();
document.querySelector('#year').textContent = now.getFullYear();
document.querySelector('#local-date').textContent = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
