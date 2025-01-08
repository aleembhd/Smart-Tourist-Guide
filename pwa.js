if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {
      scope: './'
    })
    .then((registration) => {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    })
    .catch((err) => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

// Add install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('App can be installed');
}); 
