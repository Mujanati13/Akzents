# Backend - How to Launch

## Prerequisites

- **Node.js**: Version 16.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **PostgreSQL**: Database server running
- **Redis**: (Optional, for worker queues)

## Step 1: Install Dependencies

```bash
cd Backend
npm install
```

## Step 2: Configure Environment Variables

1. The environment file `env` should already exist. If not, copy from `env-example-relational`:
   ```bash
   cp env-example-relational env
   ```

2. Edit the `env` file and configure the following required variables:
   - `DATABASE_HOST`: PostgreSQL host (default: `localhost`)
   - `DATABASE_PORT`: PostgreSQL port (default: `5432`)
   - `DATABASE_USERNAME`: PostgreSQL username (default: `postgres`)
   - `DATABASE_PASSWORD`: PostgreSQL password
   - `DATABASE_NAME`: Database name (default: `akzente`)
   - `APP_PORT`: Backend server port (default: `3000`)
   - `AUTH_JWT_SECRET`: Secret key for JWT tokens
   - `AUTH_REFRESH_SECRET`: Secret key for refresh tokens

## Step 3: Database Setup

1. Create the PostgreSQL database:
   ```bash
   createdb akzente
   ```

2. Run migrations:
   ```bash
   npm run migration:run
   ```

3. (Optional) Run seeds to populate initial data:
   ```bash
   npm run seed:run:relational
   ```

   **OR** use the SQL file to populate initial data (see below)

## Step 4: Populate Initial Data (Alternative Method)

If you prefer to use the SQL file instead of seeds, you can populate the database with initial data using the `db.sql` file located in the project root directory (one level up from the Backend folder):

1. Make sure your database is created and migrations have been run
2. Navigate to the project root directory (where `db.sql` is located)
3. Execute the SQL file using psql:
   ```bash
   psql -U postgres -d akzente -f db.sql
   ```
   
   Or from the Backend directory:
   ```bash
   psql -U postgres -d akzente -f ../db.sql
   ```

   **Note**: Replace `postgres` with your PostgreSQL username if different.

The `db.sql` file contains initial data for:
- Status types (Active, Inactive)
- Countries (Germany, Austria, Switzerland, Luxembourg)
- Job types (Visual Merchandiser, Sales adviser, Dekorateur, Folierung)
- Languages (Deutsch, Englisch, Französisch, Spanisch, Italienisch, Arabisch)
- Merchandiser statuses (Neu, Team, Out)
- User types (akzente, client, merchandiser)
- Report statuses with different names and colors for each user type
- Roles (Admin, User, Member, Guest)
- Answer types (text, select, multiselect, boolean)
- Cities (Berlin, Hamburg, Munich, Cologne, Frankfurt, Stuttgart)
- Contractuals (Gewerbeschein, DSVGO, Clearing)
- Sample users (akzente, client, merchandiser accounts)

**Important**: This SQL file should be executed **after** running migrations, as it inserts data into tables that must already exist.

## Step 5: Start the Development Server

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`

## Step 6: Access API Documentation

Once the server is running, you can access the Swagger API documentation at:
```
http://localhost:3000/docs
```

## Additional Commands

- **Build for production**: `npm run build`
- **Start production server**: `npm run start:prod`
- **Run tests**: `npm run test`
- **Run E2E tests**: `npm run test:e2e`
- **Lint code**: `npm run lint`

## Docker Setup (Alternative)

If you prefer using Docker:

```bash
docker-compose up -d
```

This will start PostgreSQL, Redis, and the API server in containers.
