# Desplegar QuickTap en un VPS de Namecheap

Guía paso a paso para un VPS con acceso SSH (Ubuntu 22.04+). La app necesita
Node.js, PostgreSQL y soporte de WebSockets (Socket.IO), por eso un VPS es el
camino correcto — el hosting compartido básico de cPanel no cubre esto de
forma confiable.

## Cuál es el servidor de producción

Hoy **solo hay uno**: `server2.quicktap.club` (104.207.74.80), el que sirve quicktap.club.
Los alias de SSH `quicktap-vps` y `quicktap-vps-root` apuntan los dos ahí, a propósito.

Hubo un segundo servidor (162.0.228.25) que quedó fuera de servicio el 2026-08-19. Sigue
encendido y respondiendo por HTTP, así que un despliegue equivocado contra esa IP parecería
funcionar y no se notaría hasta buscar los cambios en el sitio real. Si te encuentras un alias
o un script apuntando ahí, está mal.

Antes de desplegar, confirma que estás donde crees:

```bash
ssh quicktap-vps "hostname"
```

Debe responder `server2.quicktap.club`.

## 0. Antes de empezar

- Contrata/activa el VPS en Namecheap y anota su IP pública.
- En el panel de DNS de Namecheap, crea un registro **A** apuntando tu
  dominio (y `www`) a la IP del VPS. Puede tardar unos minutos en propagar.

## 1. Preparar el servidor

Conéctate por SSH y actualiza el sistema:

```bash
ssh root@TU_IP
apt update && apt upgrade -y
```

Instala Node.js 20 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
```

Instala PostgreSQL, Nginx, Certbot y PM2:

```bash
apt install -y postgresql postgresql-contrib nginx certbot python3-certbot-nginx
npm install -g pm2
```

Firewall básico:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

## 2. Base de datos

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE quicktap;
CREATE USER quicktap WITH ENCRYPTED PASSWORD 'una-contraseña-fuerte';
GRANT ALL PRIVILEGES ON DATABASE quicktap TO quicktap;
\q
```

## 3. Subir el código

```bash
mkdir -p /var/www/quicktap
cd /var/www/quicktap
git clone https://github.com/leonardphotos/QuickTap.git .
```

Para que el VPS pueda clonar/actualizar, la rama que vayas a desplegar debe
estar subida a GitHub (`git push origin <tu-rama>`). Si el repo es privado,
usa un token de acceso personal o una llave SSH configurada en el VPS.

(O sube el código por `scp`/`rsync` si no usas git en el servidor.)

## 4. Backend

```bash
cd /var/www/quicktap
npm ci
cp .env.production.example .env
nano .env   # completa DATABASE_URL, JWT_SECRET, CORS_ORIGINS, PLATFORM_ADMIN_*
```

Aplica las migraciones y genera el cliente de Prisma:

```bash
npx prisma migrate deploy
npx prisma generate
```

Compila TypeScript a `dist/`:

```bash
npm run build
```

Crea la cuenta del Dashboard maestro (una sola vez):

```bash
npm run seed:platform-admin
```

Arranca con PM2:

```bash
mkdir -p logs
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # sigue la instrucción que imprime para que arranque al reiniciar el VPS
```

## 5. Frontend

```bash
cd /var/www/quicktap/web
npm ci
npm run build
```

Esto genera `web/dist`, que es exactamente lo que Nginx sirve como estático
(ver `deploy/nginx.conf.example`).

## 6. Nginx + SSL

```bash
cp /var/www/quicktap/deploy/nginx.conf.example /etc/nginx/sites-available/quicktap
nano /etc/nginx/sites-available/quicktap   # reemplaza "tudominio.com" por tu dominio real
ln -s /etc/nginx/sites-available/quicktap /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

Certificado SSL gratuito (Let's Encrypt), Certbot reescribe el bloque a HTTPS solo:

```bash
certbot --nginx -d tudominio.com -d www.tudominio.com
```

## 7. Verificación

- `https://tudominio.com` → landing pública.
- `https://tudominio.com/admin/login` → panel del restaurante.
- `https://tudominio.com/master/login` → Dashboard maestro (con el
  `PLATFORM_ADMIN_EMAIL`/`PLATFORM_ADMIN_PASSWORD` que pusiste en `.env`).
- Revisa que las notificaciones en tiempo real (cocina, mesas) funcionen: si
  no llegan, verifica el bloque `location /socket.io/` en Nginx.
- Sube un comprobante de pago de prueba desde la landing y confírmalo desde
  el Dashboard maestro (`/master/proofs`).

## 8. Actualizar la app más adelante

```bash
cd /var/www/quicktap
git pull
npm ci
npx prisma migrate deploy
npm run build
pm2 reload quicktap-api

cd web
npm ci
npm run build
```

Nginx sirve `web/dist` directamente, así que no hace falta reiniciarlo tras
un rebuild del frontend (solo si cambias la config de Nginx en sí).

## Notas

- Los archivos subidos (fotos, logos, comprobantes de pago) se guardan en
  `uploads/` en el VPS — inclúyelo en tu backup, no vive en git.
- `JWT_SECRET` debe ser único y secreto en producción; no reutilices el de
  desarrollo.
- El seed de admin de plataforma (`npm run seed:platform-admin`) es
  idempotente: puedes volver a correrlo para cambiar la contraseña.
