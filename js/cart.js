/* ==========================================================================
   SARAB CART + CHECKOUT
   --------------------------------------------------------------------------
   - Real working cart: add / update quantity / remove / clear, persisted in
     localStorage so it survives page loads (menu -> checkout).
   - Slide-in cart drawer, floating cart button with live item count, toasts.
   - Promo codes, free delivery over $25 and 8.875% NYC sales tax.
   - Checkout: order summary, branch picker, delivery/pickup/dine-in, customer
     details, payment method, order reference confirmation. The order is handed
     to the restaurant by email or phone (static site - see the notes in the
     project README about connecting a payment API / backend).
   - Fires add_to_cart, begin_checkout and purchase events to GA4 / Google Ads.
   Include on any page that needs the cart:  <script src="js/cart.js"></script>
   ========================================================================== */
(function () {
   'use strict';

   /* ---------- config ---------- */
   var CART_KEY = 'sarab_cart_v1';
   var ORDER_KEY = 'sarab_last_order_v1';
   var BRANCH_KEY = 'sarab_branch_v1';
   var DELIVERY_FEE = 3.99;
   var FREE_DELIVERY_OVER = 25;
   var TAX_RATE = 0.08875;
   var CURRENCY = '$';
   var PROMOS = {
      'SARAB10': { type: 'percent', value: 10, label: '10% welcome discount' },
      'CHEAP5': { type: 'amount', value: 5, label: '$5 off your order' },
      'FREEDEL': { type: 'delivery', value: 0, label: 'Free delivery' }
   };

   /* ---------- base path (works from / and /recipes/) ---------- */
   var SRC = '';
   try {
      SRC = (document.currentScript && document.currentScript.src) || '';
   } catch (e) { }
   var BASE = SRC ? SRC.replace(/js\/cart\.js.*$/, '') : '';

   /* ---------- helpers ---------- */
   function money(n) {
      return CURRENCY + Number(n || 0).toFixed(2);
   }
   function parsePrice(v) {
      var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
      return isNaN(n) ? 0 : n;
   }
   function slug(v) {
      return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
   }
   function read(key, fallback) {
      try {
         var raw = window.localStorage.getItem(key);
         return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
         return fallback;
      }
   }
   function write(key, value) {
      try {
         window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* private mode - cart stays in memory only */ }
   }
   function track(name, params) {
      if (typeof window.gtag === 'function') {
         window.gtag('event', name, params || {});
      }
   }

   /* ---------- cart model ---------- */
   var items = read(CART_KEY, []);
   if (!Array.isArray(items)) items = [];

   var Cart = {
      items: items,
      base: BASE,
      freeDeliveryOver: FREE_DELIVERY_OVER,

      count: function () {
         return items.reduce(function (n, i) { return n + i.qty; }, 0);
      },

      subtotal: function () {
         return items.reduce(function (n, i) { return n + (i.price * i.qty); }, 0);
      },

      find: function (id) {
         return items.filter(function (i) { return i.id === id; })[0] || null;
      },

      promo: function (code) {
         var key = String(code || '').trim().toUpperCase();
         return PROMOS[key] ? { code: key, rule: PROMOS[key] } : null;
      },
      /* orderType: 'delivery' | 'pickup' | 'dinein' */
      totals: function (promoCode, orderType) {
         var sub = Cart.subtotal();
         var promo = Cart.promo(promoCode);
         var discount = 0;
         var delivery = 0;

         if (promo) {
            if (promo.rule.type === 'percent') discount = sub * promo.rule.value / 100;
            else if (promo.rule.type === 'amount') discount = Math.min(promo.rule.value, sub);
         }

         var afterDiscount = Math.max(0, sub - discount);

         if (orderType === 'delivery') {
            var free = afterDiscount >= FREE_DELIVERY_OVER || (promo && promo.rule.type === 'delivery');
            delivery = (items.length === 0 || free) ? 0 : DELIVERY_FEE;
         }

         var tax = Math.round(afterDiscount * TAX_RATE * 100) / 100;
         var total = Math.max(0, afterDiscount + delivery + tax);

         return {
            count: Cart.count(),
            subtotal: sub,
            discount: discount,
            promo: promo ? promo.code : '',
            promoLabel: promo ? promo.rule.label : '',
            delivery: delivery,
            tax: tax,
            taxRate: TAX_RATE,
            total: total,
            orderType: orderType || 'delivery'
         };
      },

      add: function (item, qty) {
         if (!item || !item.title) return null;
         var id = item.id || slug(item.title);
         var price = typeof item.price === 'number' ? item.price : parsePrice(item.price);
         var n = Math.max(1, parseInt(qty || 1, 10));
         var existing = Cart.find(id);

         if (existing) {
            existing.qty += n;
         } else {
            items.push({
               id: id,
               title: item.title,
               cat: item.cat || '',
               price: price,
               img: item.img || '',
               qty: n
            });
         }
         Cart.save();
         render();
         toast('<strong>' + (existing ? 'Updated: ' : 'Added: ') + '</strong>' + item.title + (n > 1 ? ' x' + n : ''));
         track('add_to_cart', {
            currency: 'USD',
            value: price * n,
            items: [{ item_id: id, item_name: item.title, price: price, quantity: n }]
         });
         return Cart.find(id);
      },

      setQty: function (id, qty) {
         var it = Cart.find(id);
         if (!it) return;
         var n = parseInt(qty, 10);
         if (isNaN(n) || n < 1) {
            Cart.remove(id);
            return;
         }
         it.qty = n;
         Cart.save();
         render();
      },

      /* always mutate in place so Cart.items stays the live array */
      remove: function (id) {
         for (var i = items.length - 1; i >= 0; i--) {
            if (items[i].id === id) items.splice(i, 1);
         }
         Cart.save();
         render();
      },

      clear: function () {
         items.length = 0;
         Cart.save();
         render();
      },

      save: function () {
         write(CART_KEY, items);
      },

      lastOrder: function () {
         return read(ORDER_KEY, null);
      },

      saveOrder: function (order) {
         write(ORDER_KEY, order);
      },

      branch: function () {
         return read(BRANCH_KEY, null);
      },

      setBranch: function (b) {
         write(BRANCH_KEY, b);
      },

      /* read a menu card element into a cart item */
      fromCard: function (card) {
         if (!card) return null;
         var mk = card.classList.contains('mcard') ? card : card.querySelector('.mcard');
         if (!mk) return null;
         return {
            id: slug(mk.getAttribute('data-title')),
            title: mk.getAttribute('data-title') || 'Menu item',
            cat: mk.getAttribute('data-cat') || '',
            price: parsePrice(mk.getAttribute('data-price')),
            img: mk.getAttribute('data-img') || ''
         };
      },

      money: money
   };
   /* ---------- cart UI ---------- */
   var el = {};

   function buildUI() {
      if (document.getElementById('scFab')) return;

      var fab = document.createElement('button');
      fab.type = 'button';
      fab.id = 'scFab';
      fab.className = 'scfab';
      fab.setAttribute('aria-label', 'Open your order');
      fab.innerHTML =
         '<i class="fas fa-shopping-cart"></i>' +
         '<span class="scfabtxt">My Order</span>' +
         '<span class="scbadge" id="scBadge">0</span>';
      document.body.appendChild(fab);

      var ov = document.createElement('div');
      ov.id = 'scOv';
      ov.className = 'scov';
      document.body.appendChild(ov);

      var dr = document.createElement('aside');
      dr.id = 'scDrawer';
      dr.className = 'scdrawer';
      dr.setAttribute('aria-label', 'Your order');
      dr.setAttribute('aria-hidden', 'true');
      dr.innerHTML = [
         '<div class="schd">',
         '   <h4><i class="fas fa-shopping-bag"></i> Your Order <span class="scn" id="scCount">0</span></h4>',
         '   <button type="button" class="scx" id="scClose" aria-label="Close cart"><i class="fas fa-times"></i></button>',
         '</div>',
         '<div class="scitems" id="scItems"></div>',
         '<div class="scfoot">',
         '   <div class="scfreenote" id="scFreeNote"></div>',
         '   <div class="scrow"><span>Subtotal</span><strong id="scSub">$0.00</strong></div>',
         '   <div class="scrow"><span>Delivery</span><strong id="scDel">$0.00</strong></div>',
         '   <div class="scrow"><span>Tax (8.875%)</span><strong id="scTax">$0.00</strong></div>',
         '   <div class="scrow total"><span>Total</span><strong id="scTotal">$0.00</strong></div>',
         '   <a class="scbtn" id="scCheckout" href="' + BASE + 'checkout.html"><i class="fas fa-lock"></i> Checkout</a>',
         '   <button type="button" class="scbtn ghost" id="scClear">Clear cart</button>',
         '   <p class="scfootnote">Free delivery on orders over $' + FREE_DELIVERY_OVER +
            ' &middot; Pay by cash, card or Apple Pay</p>',
         '</div>'
      ].join('');
      document.body.appendChild(dr);

      var ts = document.createElement('div');
      ts.id = 'scToast';
      ts.className = 'sctoast';
      document.body.appendChild(ts);

      el.fab = fab;
      el.badge = fab.querySelector('#scBadge');
      el.ov = ov;
      el.dr = dr;
      el.items = dr.querySelector('#scItems');
      el.count = dr.querySelector('#scCount');
      el.sub = dr.querySelector('#scSub');
      el.del = dr.querySelector('#scDel');
      el.tax = dr.querySelector('#scTax');
      el.total = dr.querySelector('#scTotal');
      el.freeNote = dr.querySelector('#scFreeNote');
      el.checkout = dr.querySelector('#scCheckout');
      el.close = dr.querySelector('#scClose');
      el.clear = dr.querySelector('#scClear');
      el.toast = ts;

      fab.addEventListener('click', openDrawer);
      var navCart = document.getElementById('navCartBtn');
      if (navCart) navCart.addEventListener('click', openDrawer);
      if (el.close) el.close.addEventListener('click', closeDrawer);
      ov.addEventListener('click', closeDrawer);
      if (el.clear) {
         el.clear.addEventListener('click', function () {
            if (Cart.count() === 0) return;
            if (window.confirm('Remove all items from your order?')) Cart.clear();
         });
      }

      document.addEventListener('keydown', function (e) {
         if (e.key === 'Escape') closeDrawer();
      });

      /* quantity / remove controls inside the drawer */
      el.items.addEventListener('click', function (e) {
         var row = e.target.closest ? e.target.closest('.scitem') : null;
         if (!row) return;
         var id = row.getAttribute('data-id');
         var it = Cart.find(id);
         if (!it) return;

         if (e.target.closest('.scminus')) Cart.setQty(id, it.qty - 1);
         else if (e.target.closest('.scplus')) Cart.setQty(id, it.qty + 1);
         else if (e.target.closest('.scrm')) {
            Cart.remove(id);
            track('remove_from_cart', { currency: 'USD', value: it.price * it.qty });
         }
      });

      /* delegate every "add to cart" button (menu cards, popup, branch cards) */
      document.addEventListener('click', function (e) {
         var add = e.target.closest ? e.target.closest('[data-add-to-cart]') : null;
         if (!add) return;
         e.preventDefault();
         e.stopPropagation();
         var card = add.getAttribute('data-card') === 'popup'
            ? null
            : add.closest('.mcard');
         if (card) Cart.add(Cart.fromCard(card));
      });
   }

   function openDrawer() {
      if (!el.dr) return;
      render();
      el.dr.classList.add('open');
      el.ov.classList.add('show');
      el.dr.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
   }

   function closeDrawer() {
      if (!el.dr) return;
      el.dr.classList.remove('open');
      el.ov.classList.remove('show');
      el.dr.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
   }

   function toast(msg) {
      if (!el.toast) return;
      el.toast.innerHTML = '<i class="fas fa-check-circle"></i> ' + msg;
      el.toast.classList.add('show');
      window.clearTimeout(toast._t);
      toast._t = window.setTimeout(function () {
         el.toast.classList.remove('show');
      }, 2600);
   }
   function render() {
      if (!el.dr) return;
      var t = Cart.totals();
      var n = t.count;

      if (el.badge) {
         el.badge.textContent = n;
         el.badge.style.display = n ? 'flex' : 'none';
      }
      if (el.count) el.count.textContent = n;
      var navN = document.getElementById('navCartCount');
      if (navN) {
         navN.textContent = n;
         navN.style.display = n ? 'flex' : 'none';
      }

      if (!n) {
         el.items.innerHTML =
            '<div class="scempty">' +
            '<i class="fas fa-bowl-food"></i>' +
            '<h5>Your order is empty</h5>' +
            '<p>Add a burger, pizza or one of our cheap meal deals and it will appear here.</p>' +
            '<button type="button" class="scbtn" id="scShop"><i class="fas fa-utensils"></i> Browse the menu</button>' +
            '</div>';
         el.sub.textContent = money(0);
         el.del.textContent = money(0);
         el.tax.textContent = money(0);
         el.total.textContent = money(0);
         el.freeNote.innerHTML = '<i class="fas fa-truck-fast"></i> Spend ' + money(FREE_DELIVERY_OVER) +
            ' to get <strong>free delivery</strong>.';
         el.checkout.classList.add('disabled');
         var shop = el.items.querySelector('#scShop');
         if (shop) {
            shop.addEventListener('click', function () {
               closeDrawer();
               var menu = document.getElementById('menu');
               if (menu) menu.scrollIntoView({ behavior: 'smooth' });
               else window.location.href = BASE + 'index.html#menu';
            });
         }
         return;
      }

      el.items.innerHTML = Cart.items.map(function (it) {
         return [
            '<div class="scitem" data-id="' + it.id + '">',
            '   <span class="scitimg"><img src="' + BASE + it.img + '" alt="' + it.title + '" loading="lazy"></span>',
            '   <span class="scitinfo">',
            '      <strong>' + it.title + '</strong>',
            '      <em>' + (it.cat ? it.cat + ' &middot; ' : '') + money(it.price) + ' each</em>',
            '      <span class="scqty">',
            '         <button type="button" class="scminus" aria-label="Decrease quantity">-</button>',
            '         <b>' + it.qty + '</b>',
            '         <button type="button" class="scplus" aria-label="Increase quantity">+</button>',
            '         <button type="button" class="scrm">Remove</button>',
            '      </span>',
            '   </span>',
            '   <span class="scprice">' + money(it.price * it.qty) + '</span>',
            '</div>'
         ].join('');
      }).join('');

      el.sub.textContent = money(t.subtotal);
      el.del.textContent = t.delivery ? money(t.delivery) : 'FREE';
      el.tax.textContent = money(t.tax);
      el.total.textContent = money(t.total);

      var missing = FREE_DELIVERY_OVER - t.subtotal;
      el.freeNote.innerHTML = (t.delivery === 0)
         ? '<i class="fas fa-truck-fast"></i> You have earned <strong>free delivery</strong>.'
         : '<i class="fas fa-truck-fast"></i> Add <strong>' + money(missing) + '</strong> more for free delivery.';

      el.checkout.classList.remove('disabled');
   }

   /* put an "add to cart" button on every menu card (keeps the HTML clean) */
   function injectCardButtons() {
      document.querySelectorAll('.mcard').forEach(function (card) {
         var foot = card.querySelector('.mfoot');
         if (!foot || foot.querySelector('.mcart')) return;
         var btn = document.createElement('button');
         btn.type = 'button';
         btn.className = 'mcart';
         btn.setAttribute('data-add-to-cart', '');
         btn.title = 'Add to cart';
         btn.setAttribute('aria-label', 'Add to cart');
         btn.innerHTML = '<i class="fas fa-shopping-cart"></i>';
         var plus = foot.querySelector('.madd');
         if (plus) foot.insertBefore(btn, plus);
         else foot.appendChild(btn);
      });
   }

   Cart.addFromPopup = function (qty) {
      var card = window.sarabOpenCard || null;
      var item = card ? Cart.fromCard(card) : null;

      if (!item) {
         var priceEl = document.getElementById('mpPrice');
         item = {
            title: (document.getElementById('mpTitle') || {}).textContent || 'Menu item',
            cat: (document.getElementById('mpCat') || {}).textContent || '',
            price: priceEl ? (priceEl.querySelector('small') ? priceEl.firstChild.nodeValue : priceEl.textContent) : 0,
            img: (document.getElementById('mpImg') || {}).getAttribute
               ? document.getElementById('mpImg').getAttribute('src') : ''
         };
      }
      return Cart.add(item, qty || 1);
   };

   Cart.open = openDrawer;
   Cart.close = closeDrawer;
   Cart.refresh = render;
   Cart.toast = toast;
   /* ---------- checkout page ---------- */
   function initCheckout() {
      var form = document.getElementById('checkoutForm');
      var promoMsg = document.getElementById('ckPromoMsg');
      var promoInput = document.getElementById('ckPromo');
      var appliedPromo = '';
      var branchList = window.SARAB_BRANCHES || [];

      function orderType() {
         var r = form.querySelector('input[name="ordertype"]:checked');
         return r ? r.value : 'delivery';
      }

      function selectedBranch() {
         var sel = document.getElementById('ckBranch');
         if (!sel || !sel.value) return null;
         return branchList.filter(function (b) { return b.id === sel.value; })[0] || null;
      }

      function totals() {
         return Cart.totals(appliedPromo, orderType());
      }

      function val(id) {
         var f = document.getElementById(id);
         return f ? String(f.value || '').trim() : '';
      }

      /* fill the branch picker from js/branches.js */
      function fillBranches() {
         var sel = document.getElementById('ckBranch');
         if (!sel || !branchList.length) return;
         sel.innerHTML = '<option value="">Choose your Sarab branch...</option>' + branchList.map(function (b) {
            return '<option value="' + b.id + '">' + b.city + ', ' + b.state + ' - ' + b.address + '</option>';
         }).join('');

         var saved = Cart.branch();
         if (saved && saved.id) sel.value = saved.id;

         sel.addEventListener('change', function () {
            var b = selectedBranch();
            if (b) {
               Cart.setBranch(b);
               var num = document.getElementById('ckBranchPhone');
               if (num) {
                  num.innerHTML = '<i class="fas fa-phone-alt"></i> ' + b.city +
                     ' branch: <a href="tel:' + b.tel + '">' + b.phone + '</a> &middot; ' + b.address;
               }
            }
            paint();
         });

         var first = selectedBranch();
         if (first) {
            var num = document.getElementById('ckBranchPhone');
            if (num) {
               num.innerHTML = '<i class="fas fa-phone-alt"></i> ' + first.city +
                  ' branch: <a href="tel:' + first.tel + '">' + first.phone + '</a> &middot; ' + first.address;
            }
         }
      }

      function paintItems() {
         var box = document.getElementById('ckItems');
         if (!box) return;
         if (!Cart.count()) {
            box.innerHTML = '<p class="cknone">Your cart is empty. <a href="index.html#menu">Browse the menu</a> to add something delicious.</p>';
            return;
         }
         box.innerHTML = Cart.items.map(function (it) {
            return [
               '<div class="scitem" data-id="' + it.id + '">',
               '   <span class="scitimg"><img src="' + it.img + '" alt="' + it.title + '" loading="lazy"></span>',
               '   <span class="scitinfo">',
               '      <strong>' + it.title + '</strong>',
               '      <em>' + (it.cat ? it.cat + ' &middot; ' : '') + money(it.price) + ' each</em>',
               '      <span class="scqty">',
               '         <button type="button" class="scminus" aria-label="Decrease">-</button>',
               '         <b>' + it.qty + '</b>',
               '         <button type="button" class="scplus" aria-label="Increase">+</button>',
               '         <button type="button" class="scrm">Remove</button>',
               '      </span>',
               '   </span>',
               '   <span class="scprice">' + money(it.price * it.qty) + '</span>',
               '</div>'
            ].join('');
         }).join('');
      }
      function paint() {
         var t = totals();
         paintItems();

         var set = function (id, text) {
            var n = document.getElementById(id);
            if (n) n.textContent = text;
         };
         set('ckCount', t.count + (t.count === 1 ? ' item' : ' items'));
         set('ckSub', money(t.subtotal));
         set('ckDel', t.delivery ? money(t.delivery) : 'FREE');
         set('ckTax', money(t.tax));
         set('ckTotal', money(t.total));

         var discRow = document.getElementById('ckDiscRow');
         if (discRow) {
            discRow.style.display = t.discount ? 'flex' : 'none';
            set('ckDisc', '-' + money(t.discount));
            var lbl = document.getElementById('ckDiscLbl');
            if (lbl) lbl.textContent = 'Discount' + (t.promoLabel ? ' (' + t.promoLabel + ')' : '');
         }

         var delBox = document.getElementById('ckDeliveryFields');
         if (delBox) delBox.style.display = (orderType() === 'delivery') ? '' : 'none';

         var empty = Cart.count() === 0;
         var emptyBox = document.getElementById('ckEmpty');
         var mainBox = document.getElementById('ckMain');
         if (emptyBox) emptyBox.style.display = empty ? '' : 'none';
         if (mainBox) mainBox.style.display = empty ? 'none' : '';

         var eta = document.getElementById('ckEta');
         if (eta) {
            eta.textContent = orderType() === 'delivery'
               ? 'Delivery in about 25 minutes'
               : (orderType() === 'pickup' ? 'Ready for pickup in about 20 minutes' : 'Table held for 15 minutes');
         }
         return t;
      }

      /* promo codes */
      var promoBtn = document.getElementById('ckPromoBtn');
      if (promoBtn) {
         promoBtn.addEventListener('click', function () {
            var code = String((promoInput && promoInput.value) || '').trim().toUpperCase();
            var p = Cart.promo(code);
            if (!code) {
               appliedPromo = '';
               if (promoMsg) promoMsg.innerHTML = '';
            } else if (p) {
               appliedPromo = code;
               if (promoMsg) promoMsg.innerHTML = '<span class="ok"><i class="fas fa-check"></i> ' + p.rule.label + ' applied</span>';
            } else {
               appliedPromo = '';
               if (promoMsg) promoMsg.innerHTML = '<span class="bad"><i class="fas fa-times"></i> That code is not valid</span>';
            }
            paint();
         });
      }

      /* quantity + remove inside the summary */
      var itemsBox = document.getElementById('ckItems');
      if (itemsBox) {
         itemsBox.addEventListener('click', function (e) {
            var row = e.target.closest ? e.target.closest('.scitem') : null;
            if (!row) return;
            var id = row.getAttribute('data-id');
            var it = Cart.find(id);
            if (!it) return;
            if (e.target.closest('.scminus')) Cart.setQty(id, it.qty - 1);
            else if (e.target.closest('.scplus')) Cart.setQty(id, it.qty + 1);
            else if (e.target.closest('.scrm')) Cart.remove(id);
            paint();
         });
      }

      /* order type + payment switches */
      form.querySelectorAll('input[name="ordertype"]').forEach(function (r) {
         r.addEventListener('change', paint);
      });
      form.querySelectorAll('input[name="payment"]').forEach(function (r) {
         r.addEventListener('change', function () {
            var note = document.getElementById('ckPayNote');
            if (!note) return;
            var map = {
               cash: 'Please have cash ready - our driver carries change for up to $50.',
               card: 'Our driver brings a card terminal - Visa, Mastercard, Amex and Apple Pay accepted.',
               instore: 'Pay at the counter when you collect or when you are seated.'
            };
            note.innerHTML = '<i class="fas fa-circle-info"></i> ' + (map[r.value] || '');
         });
      });
      function showDone(order) {
         var done = document.getElementById('ckDone');
         var main = document.getElementById('ckMain');
         if (!done) return;
         if (main) main.style.display = 'none';
         done.style.display = '';

         var ref = document.getElementById('ckRef');
         if (ref) ref.textContent = order.ref;

         var sum = document.getElementById('ckDoneSummary');
         if (sum) {
            sum.innerHTML = [
               '<div class="ckdone-row"><span>Branch</span><strong>' + order.branch.name + '</strong></div>',
               '<div class="ckdone-row"><span>Address</span><strong>' + order.branch.address + '</strong></div>',
               '<div class="ckdone-row"><span>Order type</span><strong>' + order.type + '</strong></div>',
               '<div class="ckdone-row"><span>Time</span><strong>' + order.when + '</strong></div>',
               '<div class="ckdone-row"><span>Payment</span><strong>' + order.payment + '</strong></div>',
               '<div class="ckdone-items">' + order.items.map(function (i) {
                  return '<div><span>' + i.qty + ' &times; ' + i.title + '</span><strong>' + money(i.qty * i.price) + '</strong></div>';
               }).join('') + '</div>',
               '<div class="ckdone-row total"><span>Total</span><strong>' + money(order.totals.total) + '</strong></div>'
            ].join('');
         }

         var mail = document.getElementById('ckMailLink');
         if (mail) mail.setAttribute('href', order.mailto);
         var call = document.getElementById('ckCallLink');
         if (call) {
            call.setAttribute('href', 'tel:' + order.branch.tel);
            call.innerHTML = '<i class="fas fa-phone-alt"></i> Call ' + order.branch.phone;
         }
         var msg = document.getElementById('ckDoneMsg');
         if (msg) {
            msg.innerHTML = 'Thanks ' + order.name.split(' ')[0] + '! Order <strong>' + order.ref +
               '</strong> is reserved. Send it to the kitchen with the email button (or call the branch) and we will start cooking.';
         }
         done.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      /* ---------- place the order ---------- */
      form.addEventListener('submit', function (e) {
         e.preventDefault();
         var errBox = document.getElementById('ckError');
         var t = totals();
         var errs = [];
         var name = val('ckName');
         var phone = val('ckPhone');
         var email = val('ckEmail');
         var when = val('ckWhen') || 'ASAP';
         var b = selectedBranch();
         var type = orderType();

         if (t.count === 0) errs.push('Your cart is empty.');
         if (name.length < 2) errs.push('Please enter your full name.');
         if (phone.replace(/[^0-9]/g, '').length < 10) errs.push('Please enter a valid phone number (10 digits or more).');
         if (email && email.indexOf('@') === -1) errs.push('That email address does not look valid.');
         if (!b) errs.push('Please choose the Sarab branch you are ordering from.');
         if (type === 'delivery') {
            if (val('ckAddress').length < 5) errs.push('Please enter your delivery street address.');
            if (val('ckCity').length < 2) errs.push('Please enter your delivery city.');
            if (val('ckZip').replace(/[^0-9]/g, '').length < 5) errs.push('Please enter a 5 digit ZIP code.');
         }

         if (errs.length) {
            if (errBox) {
               errBox.style.display = '';
               errBox.innerHTML = '<strong><i class="fas fa-triangle-exclamation"></i> Please check these details:</strong><ul>' +
                  errs.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
               errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
         }
         if (errBox) errBox.style.display = 'none';
         var pay = (form.querySelector('input[name="payment"]:checked') || {}).value || 'cash';
         var order = {
            ref: 'SAR-' + String(Date.now()).slice(-6),
            placed: new Date().toISOString(),
            branch: b,
            type: type,
            payment: pay,
            when: when,
            items: Cart.items.map(function (i) { return { title: i.title, qty: i.qty, price: i.price }; }),
            totals: t,
            name: name,
            phone: phone,
            email: email,
            address: [val('ckAddress'), val('ckCity'), val('ckZip')].filter(Boolean).join(', '),
            notes: val('ckNotes')
         };

         var lines = [
            'NEW SARAB ORDER - ' + order.ref,
            '',
            'Branch: ' + b.name + ' - ' + b.address,
            'Branch phone: ' + b.phone,
            'Order type: ' + type,
            'Time requested: ' + when,
            'Payment: ' + pay,
            '',
            'ITEMS',
            order.items.map(function (i) {
               return '  ' + i.qty + ' x ' + i.title + ' @ ' + money(i.price) + ' = ' + money(i.qty * i.price);
            }).join('\n'),
            '',
            'Subtotal: ' + money(t.subtotal),
            t.discount ? 'Discount (' + t.promo + '): -' + money(t.discount) : '',
            type === 'delivery' ? 'Delivery: ' + (t.delivery ? money(t.delivery) : 'FREE') : '',
            'Tax: ' + money(t.tax),
            'TOTAL: ' + money(t.total),
            '',
            'CUSTOMER',
            'Name: ' + name,
            'Phone: ' + phone,
            order.email ? 'Email: ' + order.email : '',
            order.address ? 'Address: ' + order.address : '',
            order.notes ? 'Notes: ' + order.notes : '',
            '',
            'Sent from sarabfood.com'
         ].filter(function (l) { return l !== ''; });

         order.emailBody = lines.join('\n');
         order.mailto = 'mailto:orders@sarabfood.com' +
            '?subject=' + encodeURIComponent('New Sarab order ' + order.ref) +
            '&body=' + encodeURIComponent(order.emailBody);

         Cart.saveOrder(order);
         Cart.clear();
         paint();
         showDone(order);

         track('purchase', {
            transaction_id: order.ref,
            value: t.total,
            tax: t.tax,
            shipping: t.delivery,
            currency: 'USD',
            items: order.items.map(function (i) {
               return { item_name: i.title, price: i.price, quantity: i.qty };
            })
         });
         if (typeof window.gtag === 'function') {
            window.gtag('event', 'conversion', {
               send_to: 'AW-XXXXXXXXXX/PURCHASE-LABEL',
               transaction_id: order.ref,
               value: t.total,
               currency: 'USD'
            });
         }
      });

      fillBranches();
      paint();

      return { paint: paint };
   }


   /* ---------- boot ---------- */
   function boot() {
      buildUI();
      injectCardButtons();
      render();
      if (document.getElementById('checkoutForm')) initCheckout();
   }

   if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
   } else {
      boot();
   }

   window.SarabCart = Cart;

})();
