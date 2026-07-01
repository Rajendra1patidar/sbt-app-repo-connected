# SBT Backend API

Node.js + Express + MongoDB (Mongoose) backend for the **Shree Balaji Traders** invoicing app
(customers, items/inventory, orders, quotes, invoices, delivery challans, expenses, payments, settings, reports).

It replaces the original frontend's in-memory/localStorage state with a real database and
secures every business route behind a JWT issued from your PIN login.

## 1. Local setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env: paste your MongoDB Atlas URI and a random JWT_SECRET
npm run dev        # starts on http://localhost:5000 with nodemon
```

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 2. Environment variables

| Variable       | Description                                                                 |
|----------------|-------------------------------------------------------------------------------|
| `PORT`         | Port the server listens on (Railway sets this automatically)                |
| `MONGODB_URI`  | MongoDB Atlas connection string                                              |
| `JWT_SECRET`   | Random secret used to sign login tokens                                      |
| `CORS_ORIGIN`  | Comma-separated list of frontend URLs allowed to call this API               |

## 3. First-time account setup

There's no public signup page in the original app (PIN was stored in the browser). Call
`POST /api/auth/register` **once** to create the owner account, then use `/api/auth/login` afterward.

```bash
curl -X POST https://your-api.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","pin":"1234","name":"Owner"}'
```

This returns a JWT `token` — send it as `Authorization: Bearer <token>` on every other request.

## 4. API reference

All routes below (except `/api/auth/*` and `/api/health`) require the `Authorization: Bearer <token>` header.

### Auth
| Method | Route                  | Body                          |
|--------|-------------------------|--------------------------------|
| POST   | `/api/auth/register`   | `{ email, pin, name }`        |
| POST   | `/api/auth/login`      | `{ email, pin }`               |
| POST   | `/api/auth/change-pin` | `{ currentPin, newPin }`       |
| GET    | `/api/auth/me`         | —                               |

### Customers — `/api/customers`
Standard CRUD: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`
Body: `{ name, email, phone, location }`

### Items / Inventory — `/api/items`
CRUD as above, plus `GET /meta/low-stock`.
Body: `{ name, sellingPrice, purchasePrice, unit, stock, lowStock }`

### Orders (restocking) — `/api/orders`
CRUD as above, plus `PATCH /:id/receive` — marks an order received and adds its qty back into item stock.
Body: `{ itemId, qty, date, notes }`

### Quotes — `/api/quotes`
CRUD + `PATCH /:id/status` (`{ status }`) + `POST /:id/convert` (creates an invoice from the quote).

### Invoices — `/api/invoices`
CRUD + `PATCH /:id/status`. Creating an invoice automatically deducts stock for each line item and
the response includes a `lowStock` array if any item drops to/below its threshold.
Body: `{ customerId, date, dueDate, lines: [{ itemId, qty }], notes, total }`

### Delivery Challans — `/api/challans`
CRUD + `PATCH /:id/status`.
Body adds route-sheet fields: `{ route, fromDate, toDate, byWhom, transporter, expenses, incomes, deliveryFee, feeVerified }`

### Expenses — `/api/expenses`
CRUD. Body: `{ category, vendor, amount, date }`

### Payments — `/api/payments`
CRUD. Creating a payment with an `invoiceId` automatically marks that invoice `Paid`.
Body: `{ customerId, amount, date, method, invoiceId }`

### Settings — `/api/settings`
`GET /` and `PUT /` — single document per logged-in owner.
Body: `{ orgName, ownerName, email, currency, businessWhatsApp }`

### Reports — `/api/reports/summary`
Returns aggregated totals (invoiced, paid, expenses, outstanding, overdue count, low-stock items) for dashboards.

### Health check
`GET /api/health` → `{ status: "ok" }` (used by Railway/uptime monitors, not protected).

## 5. Deploying to Railway

1. Push this `backend/` folder to its own GitHub repo (or a `backend/` subfolder of your monorepo).
2. On [railway.app](https://railway.app), **New Project → Deploy from GitHub repo**, pick the repo
   (set the Root Directory to `backend` if it's a subfolder).
3. In the Railway project → **Variables**, add `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN` (your deployed
   frontend URL), and `NODE_ENV=production`. Railway sets `PORT` automatically.
4. Railway auto-detects Node via Nixpacks and runs `npm install` then `node server.js` (see `railway.json`/`Procfile`).
5. Once deployed, test `https://<your-app>.up.railway.app/api/health`.

## 6. MongoDB Atlas quick setup

1. Create a free cluster at https://www.mongodb.com/cloud/atlas.
2. Database Access → add a database user with a password.
3. Network Access → add `0.0.0.0/0` (allow from anywhere) so Railway can connect.
4. Connect → Drivers → copy the connection string into `MONGODB_URI`, replacing `<password>` and adding
   a database name, e.g. `.../sbt?retryWrites=true&w=majority`.

## 7. Connecting the frontend

In the frontend, set an environment variable such as `VITE_API_URL=https://<your-app>.up.railway.app/api`
and replace the in-memory `useState` calls in `InvoiceApp.tsx` with `fetch`/`axios` calls to these
endpoints, storing the JWT token (e.g. in memory or `sessionStorage`) after login. We'll wire this up
together in the next step.
