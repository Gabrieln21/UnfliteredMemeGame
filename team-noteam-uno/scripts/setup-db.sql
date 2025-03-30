-- Create database user
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'uno_user') THEN
        CREATE USER uno_user WITH PASSWORD 'uno_password';
    END IF;
END
$$;

-- Create database if it doesn't exist
CREATE DATABASE uno_dev;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE uno_dev TO uno_user;

-- Connect to the database
\c uno_dev;

-- Create session table
CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- Create index on session expire
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Grant table privileges to uno_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO uno_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO uno_user;