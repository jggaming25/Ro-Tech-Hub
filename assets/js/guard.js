(function () {
  try {
    var ua = navigator.userAgent || '';
    var mobile = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|Opera Mini|IEMobile|BlackBerry|Windows Phone/i.test(ua);
    var consoleDevice = /PlayStation|Xbox|Nintendo|Switch/i.test(ua);
    var screenWidth = Math.min(window.screen.width || 1920, window.screen.height || 1080);
    var coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var noFinePointer = window.matchMedia && !window.matchMedia('(any-pointer: fine)').matches;

    if (mobile || consoleDevice || (screenWidth < 1000 && coarsePointer) || (screenWidth < 900 && noFinePointer)) {
      document.documentElement.classList.add('device-blocked');
    }
  } catch (error) {
    /* Im Zweifel nicht blockieren. */
  }
})();
