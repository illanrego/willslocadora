# Optional Pix coffee support

Every support entry opens the same panel, including the 3D jar. Browsing visitors can donate without signing in. Rental completion includes a warmer invitation; donations never change rental state or access.

## Public configuration

1. Obtain a donation QR image for the same Pix copy-and-paste payload you intend to display.
2. Add the image as `public/images/pix-qr.png` (PNG, JPEG, WebP or SVG).
3. Edit `public/donation-config.js`:

   ```js
   window.LocadoraDonationConfig = Object.freeze({
     pixKey: 'YOUR_PIX_COPY_AND_PASTE_PAYLOAD',
     qrImage: './images/pix-qr.png',
   });
   ```

These are public donation details, delivered in static assets. No Worker secret or database migration is needed. The Pix payload is displayed as selectable text and copied by clicking it or the copy button. The configured QR and copy-and-paste payload must describe the same payment destination.

With an empty payload, the panel thanks visitors and says Pix is not available yet; no QR or copy controls appear. With a payload but no usable QR, copying the code still works. The 3D jar uses the same configured image, otherwise it displays a plain Pix label. Failed clipboard access leaves manual selection available.

Run `npm test` and `npm run build:pages` before committing. Publishing the static configuration/image follows the ordinary GitHub Pages workflow. Verify the recipient and scan the image yourself before publishing; the application does not verify donations or claim that copying a key completed a payment.
