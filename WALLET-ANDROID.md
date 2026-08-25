# App de Android de QuickTap Wallet

Misma filosofía que la app del panel (ver `ANDROID.md`): una **carcasa** que abre
`https://quicktap.club/wallet` en vivo — cada despliegue del portal llega a los teléfonos sin
publicar APK nueva. Convive instalada junto a la app del panel (`appId` distinto:
`club.quicktap.wallet`).

La URL inicial lleva `?app=wallet`: es lo que le dice a la SPA qué carcasa es
(`web/src/utils/native-platform.ts#appFlavor`), para que un arranque en frío no mande al login
del panel de negocios.

## Generar la APK

```bash
export JAVA_HOME=$(cat ~/tools/java_home.txt)
export ANDROID_HOME=~/Library/Android/sdk
export PATH="$JAVA_HOME/bin:$PATH"
cd wallet-app
npm run apk
```

Queda en `wallet-app/android/app/build/outputs/apk/release/app-release.apk`, firmada con la
misma llave del panel (`~/QuickTap-keys/`).

## Notificaciones (recordatorios de cuota)

- La app está registrada en el proyecto Firebase `quicktap-7952a`
  (`club.quicktap.wallet`); su `google-services.json` vive en
  `wallet-app/android/app/` y NO se versiona.
- Al abrir el dashboard dentro de la app, `useWalletPush` registra el aparato en
  `POST /public/wallet/push-tokens` (tabla `wallet_device_tokens`, atada al teléfono
  canónico del cliente).
- Un barrido en `server.ts` (`walletService.recordatoriosDeCuotas`, cada 6h) avisa por push
  las cuotas impagas que vencen dentro de 3 días; `ShopInstallment.reminderSentAt` sella cada
  aviso para no repetirlo.
