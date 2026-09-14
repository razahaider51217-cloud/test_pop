/* ==========================================================================
   SARAB - Cookie / Ads consent banner + Google Consent Mode v2 bridge
   Self-contained: no dependency on any element inside the page.
   Safe to include on every page of the site.
   ========================================================================== */
(function() {
   'use strict';

   var KEY = 'sarab_consent_v1';

   function readConsent() {
      try {
         return window.localStorage.getItem(KEY);
      } catch (e) {
         return null;
      }
   }

   function saveConsent(value) {
      try {
         window.localStorage.setItem(KEY, value);
      } catch (e) {
         /* private mode - banner will simply show again next visit */
      }
   }

   /* Push the choice into Google Consent Mode (gtag is defined in the <head>) */
   function updateConsentMode(granted) {
      if (typeof window.gtag !== 'function') return;
      window.gtag('consent', 'update', {
         'ad_storage': granted ? 'granted' : 'denied',
         'ad_user_data': granted ? 'granted' : 'denied',
         'ad_personalization': granted ? 'granted' : 'denied',
         'analytics_storage': granted ? 'granted' : 'denied'
      });
   }

   function buildBanner() {
      var bar = document.createElement('div');
      bar.className = 'ckbanner';
      bar.id = 'ckBanner';
      bar.setAttribute('role', 'dialog');
      bar.setAttribute('aria-live', 'polite');
      bar.setAttribute('aria-label', 'Cookie consent');
      bar.innerHTML =
         '<div class="ckbanner-in">' +
            '<p class="cktext"><i class="fas fa-cookie-bite me-2"></i>' +
               'We use cookies to run this site, remember your preferences and measure our Google Ads so we can keep our ' +
               '<strong>cheap recipes</strong> and menu deals coming. Read our ' +
               '<a href="privacy-policy.html">Privacy Policy</a>.' +
            '</p>' +
            '<div class="ckbtns">' +
               '<button type="button" class="ckbtn ghost" id="ckDecline">Essential only</button>' +
               '<button type="button" class="ckbtn primary" id="ckAccept">Accept all</button>' +
            '</div>' +
         '</div>';
      return bar;
   }

   function close(bar) {
      bar.classList.remove('show');
      window.setTimeout(function() {
         if (bar.parentNode) bar.parentNode.removeChild(bar);
      }, 350);
   }

   function init() {
      var stored = readConsent();
      if (stored === 'granted') {
         updateConsentMode(true);
         return;
      }
      if (stored === 'denied') {
         updateConsentMode(false);
         return;
      }

      var bar = buildBanner();
      document.body.appendChild(bar);
      window.setTimeout(function() {
         bar.classList.add('show');
      }, 900);

      document.getElementById('ckAccept').addEventListener('click', function() {
         saveConsent('granted');
         updateConsentMode(true);
         if (typeof window.gtag === 'function') {
            window.gtag('event', 'consent_accepted', { 'event_category': 'privacy' });
         }
         close(bar);
      });

      document.getElementById('ckDecline').addEventListener('click', function() {
         saveConsent('denied');
         updateConsentMode(false);
         close(bar);
      });
   }

   if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
   } else {
      init();
   }
})();
