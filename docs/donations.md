# Optional Pix support

Every support entry opens the same panel, including the 3D jar. Browsing visitors can donate without signing in. Rental completion includes a warmer invitation; donations never change rental state or access.

## Enable your Pix details

1. Obtain a donation QR image from your bank for the same Pix key you intend to display.
2. Add the image as `public/images/pix-qr.png` (PNG, JPEG, WebP or SVG).
3. Edit `public/donation-config.js`:

   ```js
   window.LocadoraDonationConfig = Object.freeze({
     pixKey: 'YOUR_ACTUAL_PIX_KEY',
     qrImage: './images/pix-qr.png',
   });
   ```

These are public donation details, delivered in static assets. No Worker secret or database migration is needed. The key is displayed as a selectable string and copied by clicking it or the copy button. This is a Pix key, not an automatically generated Pix payment payload.

With an empty key, the panel thanks visitors and says Pix is not available yet; no QR or copy controls appear. With a key but no usable QR, copying the key still works. The 3D jar uses the same configured image, otherwise it displays a plain Pix label. Failed clipboard access leaves manual selection available.

Run `npm test` and `npm run build:pages` before committing. Publishing the static configuration/image follows the ordinary GitHub Pages workflow. Verify the recipient and scan the image yourself before publishing; the application does not verify donations or claim that copying a key completed a payment.
