# IRCTC-API
## Features
- User and Admin roles.
- Real-time seat booking.
- Train and booking management.
- Built using Prisma ORM with PostgreSQL.

## Tech Stack
- Backend: Express.js
- Database: PostgreSQL (managed by Prisma ORM)
##Install dependencies
 -npm install
#update .env info
##Initialize prisma and generate client
npx prisma generate
npx prisma migrate dev --name init
##start the application
-node src/app.js

