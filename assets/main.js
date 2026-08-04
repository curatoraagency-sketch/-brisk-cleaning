// Shared behaviour for every page: header scroll state, mobile nav, FAQ accordion,
// scroll-reveal animation, and the hero quote form -> WhatsApp handoff.
const BRISK_WHATSAPP = '35797964748';

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
  applyLanguage(localStorage.getItem('brisk_lang') || 'en');

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

  // hero quote form -> builds a WhatsApp message (demo number)
  const quoteForm = document.getElementById('quoteForm');
  if (quoteForm) {
    quoteForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const name = document.getElementById('qName').value.trim();
      const phone = document.getElementById('qPhone').value.trim();
      const serviceEl = document.getElementById('qService');
      const service = serviceEl ? serviceEl.value : (quoteForm.dataset.service || 'a cleaning service');
      const msg = encodeURIComponent(`Hi Rent4Clean! My name is ${name} (${phone}). I'd like a quote for: ${service}.`);
      window.open(`https://wa.me/${BRISK_WHATSAPP}?text=${msg}`, '_blank');
    });
  }
});
