/* ==========================================================================
   SARAB TABLE BOOKING
   --------------------------------------------------------------------------
   Works on any page containing <form data-booking-form>.
   - Branch aware: reads window.SARAB_BRANCHES (js/branches.js)
   - "Book a Table" buttons ([data-book-branch]) preselect the branch and
     scroll to the form; the #hash on locations.html does the same on load.
   - Validates, builds a booking reference, shows a confirmation summary and
     hands the booking to the restaurant by email or phone (static site, no
     backend). Fires GA4 / Google Ads lead events.
   ========================================================================== */
(function () {
   'use strict';

   var KEY = 'sarab_bookings_v1';
   var EMAIL = 'hello@sarabfood.com';

   function branches() {
      return window.SARAB_BRANCHES || [];
   }

   function findBranch(id) {
      return branches().filter(function (b) { return b.id === id; })[0] || null;
   }

   function read(key, fallback) {
      try {
         var raw = window.localStorage.getItem(key);
         return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
   }

   function write(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { }
   }

   function track(name, params) {
      if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
   }

   function makeRef() {
      var d = new Date();
      var stamp = String(d.getFullYear()).slice(2) +
         String(d.getMonth() + 1).padStart(2, '0') +
         String(d.getDate()).padStart(2, '0');
      return 'BKG-' + stamp + '-' + String(Math.floor(Math.random() * 9000) + 1000);
   }

   function selectBranch(id) {
      var sel = document.getElementById('bkBranch');
      if (sel) sel.value = id;
      var b = findBranch(id);
      if (b && window.SarabCart && SarabCart.setBranch) SarabCart.setBranch(b);
      var card = document.getElementById(id);
      if (card) {
         card.classList.add('brhl');
         window.setTimeout(function () { card.classList.remove('brhl'); }, 2200);
      }
   }

   function prefill() {
      var hash = String(window.location.hash || '').replace('#', '');
      if (hash && findBranch(hash)) { selectBranch(hash); return; }
      var saved = read('sarab_branch_v1', null);
      if (saved && saved.id && findBranch(saved.id)) selectBranch(saved.id);
   }
   function initForm(form) {
      if (form.getAttribute('data-booking-ready')) return;
      form.setAttribute('data-booking-ready', '1');

      var errBox = form.querySelector('#bkError') || document.getElementById('bkError');
      var doneBox = form.querySelector('#bkDone') || document.getElementById('bkDone');
      var dateField = form.querySelector('[name="date"]');

      if (dateField && !dateField.value) {
         var iso = new Date().toISOString().slice(0, 10);
         dateField.setAttribute('min', iso);
         dateField.value = iso;
      }

      form.addEventListener('submit', function (e) {
         e.preventDefault();

         var get = function (n) {
            var f = form.querySelector('[name="' + n + '"]');
            return f ? String(f.value || '').trim() : '';
         };

         var booking = {
            branch: get('branch'),
            name: get('name'),
            phone: get('phone'),
            email: get('email'),
            guests: get('guests'),
            date: get('date'),
            time: get('time'),
            notes: get('notes')
         };

         var errs = [];
         var b = findBranch(booking.branch);
         if (!b) errs.push('Please choose the branch you want to book.');
         if (booking.name.length < 2) errs.push('Please tell us your full name.');
         if (booking.phone.replace(/[^0-9]/g, '').length < 10) errs.push('Please add a phone number (10 digits or more) so we can confirm.');
         if (booking.email && booking.email.indexOf('@') === -1) errs.push('That email address does not look valid.');
         if (!booking.date) errs.push('Please choose a date.');
         if (!booking.time) errs.push('Please choose a time.');

         if (errs.length) {
            if (errBox) {
               errBox.style.display = '';
               errBox.innerHTML = '<strong><i class="fas fa-triangle-exclamation"></i> Almost there:</strong><ul>' +
                  errs.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
               errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
         }
         if (errBox) errBox.style.display = 'none';

         booking.ref = makeRef();
         booking.branchName = b.name;
         booking.branchAddress = b.address;
         booking.branchPhone = b.phone;
         booking.branchTel = b.tel;

         var lines = [
            'TABLE BOOKING - ' + booking.ref,
            '',
            'Branch: ' + b.name,
            'Address: ' + b.address,
            'Branch phone: ' + b.phone,
            '',
            'Name: ' + booking.name,
            'Phone: ' + booking.phone,
            booking.email ? 'Email: ' + booking.email : '',
            'Guests: ' + booking.guests,
            'Date: ' + booking.date,
            'Time: ' + booking.time,
            booking.notes ? 'Notes: ' + booking.notes : '',
            '',
            'Sent from sarabfood.com'
         ].filter(function (l) { return l !== ''; });

         booking.emailBody = lines.join('\n');
         booking.mailto = 'mailto:' + EMAIL +
            '?subject=' + encodeURIComponent('Table booking ' + booking.ref + ' - ' + b.city) +
            '&body=' + encodeURIComponent(booking.emailBody);

         var list = read(KEY, []);
         list.push(booking);
         write(KEY, list);
         if (window.SarabCart && SarabCart.setBranch) SarabCart.setBranch(b);
         if (doneBox) {
            var refEl = doneBox.querySelector('#bkRef');
            if (refEl) refEl.textContent = booking.ref;

            var msg = doneBox.querySelector('#bkDoneMsg');
            if (msg) {
               msg.innerHTML = 'Thanks ' + booking.name.split(' ')[0] + '! We have pencilled in <strong>' +
                  booking.guests + '</strong> at <strong>' + b.city + '</strong> on <strong>' +
                  booking.date + '</strong> at <strong>' + booking.time + '</strong>.';
            }

            var sum = doneBox.querySelector('#bkDoneSummary');
            if (sum) {
               sum.innerHTML = [
                  '<div class="ckdone-row"><span>Branch</span><strong>' + b.name + '</strong></div>',
                  '<div class="ckdone-row"><span>Address</span><strong>' + b.address + '</strong></div>',
                  '<div class="ckdone-row"><span>Date and time</span><strong>' + booking.date + ' at ' + booking.time + '</strong></div>',
                  '<div class="ckdone-row"><span>Guests</span><strong>' + booking.guests + '</strong></div>',
                  booking.notes ? '<div class="ckdone-row"><span>Notes</span><strong>' + booking.notes + '</strong></div>' : '',
                  '<div class="ckdone-row total"><span>Reference</span><strong>' + booking.ref + '</strong></div>'
               ].filter(Boolean).join('');
            }

            var mail = doneBox.querySelector('#bkMailLink');
            if (mail) mail.setAttribute('href', booking.mailto);
            var call = doneBox.querySelector('#bkCallLink');
            if (call) {
               call.setAttribute('href', 'tel:' + b.tel);
               call.innerHTML = '<i class="fas fa-phone-alt"></i> Call ' + b.phone;
            }

            doneBox.style.display = '';
            doneBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
         }

         track('generate_lead', {
            currency: 'USD',
            value: 0,
            lead_type: 'table_booking',
            branch: b.city,
            guests: booking.guests
         });
         if (typeof window.gtag === 'function') {
            window.gtag('event', 'conversion', {
               send_to: 'AW-XXXXXXXXXX/BOOKING-LABEL',
               branch: b.city,
               guests: booking.guests
            });
         }
      });
   }

   /* "Book a Table" buttons scroll to the form and preselect the branch */
   document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-book-branch]') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-book-branch');
      if (!findBranch(id)) return;
      e.preventDefault();
      selectBranch(id);
      var target = document.getElementById('booking') || document.getElementById('reservation');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var name = document.getElementById('bkName');
      if (name) window.setTimeout(function () { name.focus({ preventScroll: true }); }, 700);
   });

   function boot() {
      document.querySelectorAll('[data-booking-form]').forEach(initForm);
      prefill();
      window.addEventListener('hashchange', prefill);
   }

   if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
   } else {
      boot();
   }

})();
