(() => {
  const form = document.getElementById('contactForm');
  const status = document.getElementById('contactStatus');
  const button = document.getElementById('contactSubmit');
  if (!form || !status || !button) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.className = 'contact-status';
    status.textContent = '送信しています…';
    button.disabled = true;
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: document.getElementById('contactName').value,
          email: document.getElementById('contactEmail').value,
          subject: document.getElementById('contactSubject').value,
          message: document.getElementById('contactMessage').value,
          website: document.getElementById('contactWebsite').value,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '送信できませんでした。');
      form.reset();
      status.className = 'contact-status success';
      status.textContent = '送信しました。お問い合わせありがとうございます。';
    } catch (error) {
      status.className = 'contact-status error';
      status.textContent = error.message || '送信できませんでした。時間を空けてもう一度お試しください。';
    } finally {
      button.disabled = false;
    }
  });
})();
