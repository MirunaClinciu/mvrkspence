  // Highlight the active nav link (desktop)
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.href === window.location.href) {
      link.classList.add('active');
    }
  });

  // Highlight the active link in the mobile menu (uses hash # section IDs)
  document.querySelectorAll('#mobile-menu a').forEach(link => {
    if (window.location.hash && link.getAttribute('href') === window.location.hash) {
      link.classList.add('active');
    }
  });
