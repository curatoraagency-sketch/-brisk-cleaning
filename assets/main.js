// Shared behaviour for every page: header scroll state, mobile nav, FAQ accordion,
// scroll-reveal animation, and the booking modal (Rent buttons -> Telegram, WhatsApp fallback).
const BRISK_WHATSAPP = '35797964748';
// Google Apps Script web app that forwards booking requests to Telegram.
// Empty -> the booking form falls back to opening WhatsApp with the request prefilled.
const BOOKING_ENDPOINT = 'https://script.google.com/macros/s/AKfycbw7zANvOl5lO8XVo0MEU0lkzaTZxbTjwPcubsF6X36giqxAeLyONuLSDDwJeUuh87M/exec';

// push a custom event into the GTM dataLayer
function pushEvent(name, params) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(Object.assign({ event: name }, params || {}));
}

// label which part of the page a clicked element lives in, for event context
function pageArea(el) {
  if (el.closest('#siteHeader')) return 'header';
  if (el.closest('.hero-full')) return 'hero';
  if (el.closest('.cta-band')) return 'cta_band';
  if (el.closest('footer')) return 'footer';
  if (el.closest('.fab-stack')) return 'floating_button';
  return 'other';
}

document.addEventListener('DOMContentLoaded', () => {
  // contact clicks -> dataLayer events for GTM/GA4
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="tel:"], a[href*="wa.me"]');
    if (!link) return;
    const isWhatsApp = link.href.includes('wa.me');
    pushEvent(isWhatsApp ? 'whatsapp_click' : 'phone_click', {
      area: pageArea(link),
      link_url: link.href
    });
  });

  // header scroll state
  const header = document.getElementById('siteHeader');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 10);
    });
  }

  // mobile burger -> simple toggle of primary nav as dropdown
  const burger = document.getElementById('burgerBtn');
  const primaryNav = document.querySelector('nav.primary');
  if (burger && primaryNav) {
    burger.addEventListener('click', () => {
      const open = primaryNav.style.display === 'flex';
      if (open) {
        primaryNav.style.display = 'none';
      } else {
        primaryNav.style.cssText = 'display:flex;position:absolute;top:82px;left:0;right:0;background:var(--paper);flex-direction:column;padding:20px 24px;gap:18px;border-bottom:1px solid var(--line);box-shadow:var(--shadow-md);';
      }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) primaryNav.removeAttribute('style');
    });
    primaryNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      if (window.innerWidth <= 900) primaryNav.style.display = 'none';
    }));
  }

  // language switcher
  function applyLanguage(lang) {
    if (!window.BRISK_I18N || !BRISK_I18N[lang]) lang = 'en';
    const dict = BRISK_I18N[lang];
    const fallback = BRISK_I18N.en;

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = dict[el.getAttribute('data-i18n')] || fallback[el.getAttribute('data-i18n')];
      if (val != null) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const val = dict[el.getAttribute('data-i18n-html')] || fallback[el.getAttribute('data-i18n-html')];
      if (val != null) el.innerHTML = val;
    });

    const title = dict['meta.title'] || fallback['meta.title'];
    if (title) document.title = title;
    const descMeta = document.querySelector('meta[name="description"]');
    const desc = dict['meta.desc'] || fallback['meta.desc'];
    if (descMeta && desc) descMeta.setAttribute('content', desc);

    document.documentElement.lang = lang;
    localStorage.setItem('brisk_lang', lang);

    document.querySelectorAll('#langSwitch [data-lang]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    // FAQ answer heights are cached in px; close open items since translated text may differ in length
    document.querySelectorAll('.faq-item.open').forEach(item => {
      item.classList.remove('open');
      item.querySelector('.faq-a').style.maxHeight = null;
    });
  }

  const langSwitch = document.getElementById('langSwitch');
  if (langSwitch) {
    langSwitch.querySelectorAll('[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
        applyLanguage(btn.dataset.lang);
        pushEvent('language_change', { language: btn.dataset.lang });
        if (window.innerWidth <= 900 && primaryNav) primaryNav.style.display = 'none';
      });
    });
  }
  // ?lang=ru / ?lang=el in the URL (e.g. from ads) wins over the remembered choice
  const urlLang = new URLSearchParams(location.search).get('lang');
  applyLanguage(urlLang || localStorage.getItem('brisk_lang') || 'en');

  // FAQ accordion
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      item.closest('.faq').querySelectorAll('.faq-item.open').forEach(o => {
        o.classList.remove('open');
        o.querySelector('.faq-a').style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('open');
        a.style.maxHeight = a.scrollHeight + 'px';
        pushEvent('faq_open', { question: q.textContent.trim() });
      }
    });
  });

  // scroll reveal
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // booking modal: "Rent" on a card -> form with that equipment preselected -> Telegram (via Apps Script)
  const modal = document.getElementById('bookModal');
  const bookForm = document.getElementById('bookForm');
  if (modal && bookForm) {
    const equipSel = document.getElementById('bookEquip');
    const nameIn = document.getElementById('bookName');
    const phoneIn = document.getElementById('bookPhone');
    const errBox = document.getElementById('bookError');
    const done = document.getElementById('bookDone');
    const submitBtn = bookForm.querySelector('[type="submit"]');
    const cards = [...document.querySelectorAll('[data-equip]')];
    const t = (key) => {
      const lang = document.documentElement.lang;
      return (BRISK_I18N[lang] && BRISK_I18N[lang][key]) || BRISK_I18N.en[key] || '';
    };
    // card label in a given language: "Steam Cleaner — Kärcher SC 3 EasyFix" / "Combo #1 — Steam cleaner + wet vacuum"
    const cardLabel = (card, lang) => {
      const dict = BRISK_I18N[lang] || BRISK_I18N.en;
      const title = card.querySelector('h4, h5');
      const sub = card.querySelector('.model') || card.querySelector('.tier-body p');
      const tr = (el) => el ? (dict[el.dataset.i18n] || el.textContent).trim() : '';
      return [tr(title), tr(sub)].filter(Boolean).join(' — ');
    };
    const showError = (html) => { errBox.innerHTML = html; errBox.hidden = !html; };

    // analytics item for a card, always in English so GA4 reports don't split by site language;
    // the price is read from the card itself, so it stays in sync with the page
    const itemData = (card) => {
      const en = BRISK_I18N.en;
      const isCombo = card.classList.contains('tier-card');
      const titleEl = card.querySelector('h4, h5');
      const title = en[titleEl.dataset.i18n] || titleEl.textContent.trim();
      const priceEl = card.querySelector('.price b');
      const price = priceEl ? parseFloat(priceEl.textContent.replace(/[^\d.,]/g, '').replace(',', '.')) || 0 : 0;
      const descEl = card.querySelector('.tier-body p');
      return {
        item_id: card.dataset.equip,
        item_name: isCombo ? `${title}: ${en[descEl.dataset.i18n] || descEl.textContent.trim()}` : card.querySelector('.model').textContent.trim(),
        item_category: isCombo ? 'Combo' : title,
        item_variant: isCombo ? 'combo' : 'per day',
        price
      };
    };
    // GA4 ecommerce-shaped dataLayer event (also flat fields for simple GTM variables)
    const pushItemEvent = (name, card, extra) => {
      const item = itemData(card);
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ ecommerce: null }); // clear the previous ecommerce object, as Google recommends
      pushEvent(name, Object.assign({
        equipment: item.item_id,
        item_id: item.item_id,
        item_name: item.item_name,
        item_category: item.item_category,
        price: item.price,
        currency: 'EUR',
        value: item.price,
        ecommerce: {
          currency: 'EUR',
          value: item.price,
          items: [Object.assign({ index: cards.indexOf(card), quantity: 1 }, item)]
        }
      }, extra || {}));
    };

    function openBooking(equipId) {
      equipSel.innerHTML = '';
      cards.forEach(card => equipSel.add(new Option(cardLabel(card, document.documentElement.lang), card.dataset.equip)));
      equipSel.value = equipId;
      showError('');
      [nameIn, phoneIn].forEach(i => i.classList.remove('invalid'));
      bookForm.hidden = false;
      done.hidden = true;
      document.documentElement.classList.add('modal-open');
      modal.showModal();
      pushItemEvent('rent_click', cards.find(c => c.dataset.equip === equipId));
    }
    // unlock page scroll on every way out (the dialog 'close' event alone is not reliable everywhere)
    const unlockScroll = () => document.documentElement.classList.remove('modal-open');
    function closeBooking() { modal.close(); unlockScroll(); }

    document.querySelectorAll('.rent-btn').forEach(btn => btn.addEventListener('click', () => {
      openBooking(btn.closest('[data-equip]').dataset.equip);
    }));
    modal.querySelectorAll('[data-book-close]').forEach(b => b.addEventListener('click', closeBooking));
    modal.addEventListener('click', (e) => { if (e.target === modal) closeBooking(); }); // backdrop click
    modal.addEventListener('cancel', unlockScroll); // Esc key
    modal.addEventListener('close', unlockScroll);
    [nameIn, phoneIn].forEach(i => i.addEventListener('input', () => i.classList.remove('invalid')));

    bookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameIn.value.trim();
      const phone = phoneIn.value.trim();
      const digits = phone.replace(/\D/g, '');
      if (!name) { nameIn.classList.add('invalid'); showError(t('book.errName')); nameIn.focus(); return; }
      if (digits.length < 8 || digits === '357') { phoneIn.classList.add('invalid'); showError(t('book.errPhone')); phoneIn.focus(); return; }

      const card = cards.find(c => c.dataset.equip === equipSel.value);
      const equipment = cardLabel(card, 'ru'); // the owner reads Telegram requests in Russian
      // the WhatsApp text is sent by the visitor, so write it in their language
      const waText = encodeURIComponent(t('book.waMsg')
        .replace('{equip}', cardLabel(card, document.documentElement.lang))
        .replace('{name}', name).replace('{phone}', phone));
      const waLink = `https://wa.me/${BRISK_WHATSAPP}?text=${waText}`;

      // no Telegram endpoint configured yet -> hand the request over to WhatsApp
      if (!BOOKING_ENDPOINT) {
        pushItemEvent('booking_submit', card, { channel: 'whatsapp' });
        window.open(waLink, '_blank');
        closeBooking();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = t('book.sending');
      showError('');
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        // text/plain body keeps it a "simple" request, so Apps Script needs no CORS preflight
        const res = await fetch(BOOKING_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify({
            equipment, name, phone,
            lang: document.documentElement.lang,
            page: location.href,
            website: bookForm.website.value // honeypot
          }),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'send failed');
        pushItemEvent('booking_submit', card, { channel: 'telegram' });
        bookForm.reset();
        phoneIn.value = '+357 ';
        bookForm.hidden = true;
        done.hidden = false;
      } catch (err) {
        pushEvent('booking_error', { equipment: card.dataset.equip, error_message: String(err && err.message || err).slice(0, 100) });
        showError(`${t('book.errSend')} <a href="${waLink}" target="_blank" rel="noopener">${t('common.whatsappUs')} →</a>`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = t('book.send');
      }
    });
  }
});
