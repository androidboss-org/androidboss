/** Sample SVG covering shapes, nested transforms, opacity, inline style and even-odd fill. */
export const SAMPLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Material-style check icon -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect x="2" y="2" width="20" height="20" rx="4" fill="#0F8A4A"/>
  <g transform="translate(12 12) rotate(45)" opacity="0.5">
    <circle cx="0" cy="0" r="3" fill="white" stroke="#000" stroke-width="2" stroke-linecap="round"/>
  </g>
  <path d="M7 12l3 3 7-7" fill="none" stroke="#FFF" style="stroke-width:2;stroke-linejoin:round" />
  <path fill-rule="evenodd" fill="rgba(0,0,0,0.25)" d="M0 0h4v4H0z M1 1h2v2H1z"/>
</svg>`;
