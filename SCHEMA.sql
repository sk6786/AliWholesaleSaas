-- SCHEMA.sql: Ali's Automated Wholesale Distributor
-- Role: Senior Database Engineer
-- Optimized for Supabase (PostgreSQL) with PostGIS for Geofencing

-- 1. Extensions
-- PostGIS is essential for the 15-mile geofence and route density calculations.
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. ENUMS
CREATE TYPE lead_status AS ENUM ('NEW', 'QUALIFIED', 'CONVERTED', 'REJECTED');
CREATE TYPE order_status AS ENUM ('PENDING', 'CREDIT_APPROVED', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED');
CREATE TYPE geofence_status AS ENUM ('INSIDE', 'OUTSIDE');

-- 3. TABLES

-- Leads: Prospecting data from Google Maps
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name TEXT NOT NULL,
    contact_name TEXT,
    phone_number TEXT UNIQUE NOT NULL,
    address TEXT,
    city TEXT DEFAULT 'New York',
    state TEXT DEFAULT 'NY',
    -- PostGIS Point for spatial queries (Latitude, Longitude)
    location GEOGRAPHY(POINT, 4326), 
    geofence_status geofence_status DEFAULT 'OUTSIDE',
    sentiment_score NUMERIC(3, 2) DEFAULT 0.5, -- 0.0 to 1.0 (LLM derived)
    status lead_status DEFAULT 'NEW',
    downstream_customer_profile TEXT, -- Notes on who their customers are
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Customers: Converted leads
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id),
    business_name TEXT NOT NULL,
    tax_id TEXT UNIQUE,
    payment_terms TEXT DEFAULT 'COD', -- 'COD', 'Pre-paid', 'Net30'
    is_multi_location BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- CreditAccounts: Financial health and limits
CREATE TABLE credit_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) UNIQUE,
    credit_limit DECIMAL(12, 2) DEFAULT 0.00,
    outstanding_balance DECIMAL(12, 2) DEFAULT 0.00,
    is_frozen BOOLEAN DEFAULT FALSE,
    last_credit_check TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- CallInteractions: Vapi voice logs
CREATE TABLE call_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id),
    vapi_call_id TEXT UNIQUE, -- ID from Vapi API
    transcript TEXT,
    sentiment_score NUMERIC(3, 2),
    detected_volume_intent DECIMAL(10, 2), -- lbs per month
    requires_escalation BOOLEAN DEFAULT FALSE,
    escalation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- TruckRoutes: Logistics planning
CREATE TABLE truck_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_name TEXT,
    vehicle_id TEXT,
    departure_time TIMESTAMPTZ,
    route_status TEXT DEFAULT 'PLANNING', -- 'PLANNING', 'IN_TRANSIT', 'COMPLETED'
    optimized_path GEOMETRY(LineString, 4326), -- The LIE cluster path
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Orders: The core transaction
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id),
    truck_route_id UUID REFERENCES truck_routes(id),
    total_weight_lbs DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    status order_status DEFAULT 'PENDING',
    inventory_checked BOOLEAN DEFAULT FALSE,
    payment_method TEXT, -- 'COD', 'CreditCard', 'CreditAccount'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Downstream_Customers (Advanced): Tracking Ali's customers' customers
CREATE TABLE downstream_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_customer_id UUID REFERENCES customers(id),
    business_type TEXT, -- e.g., 'Bakery', 'Specialty Grocery'
    location_count INT DEFAULT 1,
    estimated_monthly_consumption DECIMAL(10, 2), -- To identify high-margin gaps
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. INDEXING STRATEGY

-- GIST Index for PostGIS Geography (Critical for the 15-mile radius query)
-- This enables fast "Within distance" queries across thousands of leads.
CREATE INDEX idx_leads_location ON leads USING GIST (location);

-- B-Tree Indexes for Performance
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_leads_phone ON leads(phone_number);
CREATE INDEX idx_credit_accounts_customer ON credit_accounts(customer_id);

-- 5. SCALABILITY EXPLANATION (POSTGIS)
/*
Indexing Strategy for Geofencing & Route Density:
1. Spatial Indexing: By using a GIST index on the 'location' GEOGRAPHY column, we avoid 
   expensive full-table scans. Queries like "Find leads within 15 miles of Western LI" 
   execute in O(log N) time.
2. ST_DWithin: For Ali's 15-mile geofence, we use `ST_DWithin(location, center_point, 24140)` 
   (24140 meters = 15 miles).
3. Routing Optimization: PostGIS allows us to group orders into spatial "clusters" (using ST_ClusterKMeans). 
   This ensures orders are grouped by neighborhood before being sent to the Routing API, 
   directly solving Ali's "don't crisscross the LIE" requirement.
*/
