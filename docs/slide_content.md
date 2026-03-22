# Ali Wholesale SaaS: Interview Presentation

## Slide 1: Title Slide
**Ali Wholesale SaaS**
AI-Powered Sales and Delivery Platform for Wholesale Food Distribution

Transforming a manual wholesale operation into an automated lead-to-delivery pipeline using AI voice agents, real-time credit checking, and territory-based logistics.

## Slide 2: Ali's Business Problem Demands Automation, Not More Headcount
Ali is a wholesale food distributor selling bulk ingredients (raisins, cinnamon, sesame, nuts, chilies) to bakeries in Western Long Island. His current operation is constrained by manual cold-calling (10-15 calls/day), no systematic follow-up on leads who say "not now," and disconnected sales-to-delivery handoffs. The solution is not hiring more salespeople — it is building an AI-assisted platform that handles the routine 80% of calls while keeping Ali in control of the strategic 20%.

Key facts:
- Service region: 15-mile geofence around Mineola, Long Island
- Target customers: Bakeries, bagel chains, industrial bakeries
- Products: Bulk seeds, nuts, spices, dried fruits, chilies imported from India
- Goal: Scale from 10-15 manual calls/day to 50-100 AI-assisted calls/day

## Slide 3: The MVP Focuses on Three Core Capabilities
The system combines AI sales automation, CRM pipeline management, and logistics orchestration into a single dashboard. This is not a full platform build — it is a focused MVP that addresses Ali's three biggest bottlenecks.

| Capability | What It Solves | Technology |
|---|---|---|
| AI Sales Engine | Automated outbound calling with real-time transcript streaming and keyword extraction | Vapi AI Voice Agent |
| CRM + Pipeline | Lead tracking, drip campaigns, credit checking, and human escalation | Supabase (PostgreSQL + PostGIS) |
| Logistics | Territory-based route grouping with truck capacity management | Google Maps Routing API |

## Slide 4: System Architecture Connects Five Subsystems Through Supabase
The architecture flows from lead sourcing through AI sales to either fulfillment or follow-up, with human-in-the-loop escalation at every critical decision point. Supabase serves as the central data layer, providing PostgreSQL with PostGIS for geofencing, real-time subscriptions for dashboard updates, and edge functions for serverless processing.

Five subsystems: (1) Lead Sourcing via Google Maps scraper with 15-mile geofence, (2) AI Sales Engine via Vapi with real-time inventory and credit checks, (3) Human-in-the-Loop escalation for sentiment, credit, and volume triggers, (4) Logistics and Routing via Google Maps API with zip cluster optimization, (5) Drip and Follow-Up via Zapier for 30-day re-engagement cycles.

Image: Use the system architecture diagram showing all five subsystems and their data flows.

## Slide 5: Nine Database Entities Model the Complete Lead-to-Delivery Lifecycle
The data model uses PostgreSQL with PostGIS and covers all eight required entities plus a bonus Downstream Customers table. Key design decisions include PostGIS GEOGRAPHY columns for O(log N) geofence queries, PostgreSQL arrays for products_of_interest, and separate Leads vs Customers tables to track the full conversion funnel.

Core entities and their relationships: Leads (central, with spatial indexing) convert to Customers, who have CreditAccounts and place Orders. Orders are assigned to TruckRoutes driven by Drivers. CallInteractions log every Vapi call. Campaigns track drip follow-ups. DownstreamCustomers enable margin optimization.

Image: Use the ERD diagram showing all 9 tables with fields and relationships.

## Slide 6: AI Calls Follow a Four-Phase Workflow with Real-Time Validation
Every outbound call progresses through four visible phases in the dashboard: Connecting (2s telephony delay), Streaming (real-time transcript with keyword highlighting), Calculating (credit check and order estimation), and Summary (outcome card with action buttons). The AI agent performs real-time validation against Supabase during the call — checking inventory availability and credit limits before confirming any order.

Call outcomes branch into four paths: (1) Order placed + credit OK → create order and route to fulfillment, (2) Order placed + credit exceeded → block order and escalate to Ali, (3) Not interested → enroll in 30-day drip campaign, (4) Negative sentiment detected → pause call and alert Ali for human takeover.

Image: Use the call workflow sequence diagram showing all branching scenarios.

## Slide 7: Five Escalation Triggers Keep Ali in Control of Sensitive Situations
The system automatically breaks the automation loop under five conditions, each with a specific UI response. Negative sentiment (keywords: angry, upset, cancel) triggers an immediate red banner and call pause. Credit limit exceeded shows an orange banner with a full financial breakdown. Volume threshold (>500 lbs/month), strategic clients (multi-location chains), and complex pricing requests all route to Ali's team for human review.

| Trigger | Detection | UI Response |
|---|---|---|
| Negative Sentiment | Real-time keyword analysis | Red banner + call pause + "Alert Ali" button |
| Credit Exceeded | outstanding + order > limit | Orange banner + financial breakdown + escalation |
| Volume > 500 lbs | Detected volume intent | High value alert to Ali |
| Strategic Client | Multi-location flag | Flag for human review |
| Complex Pricing | Custom tier request | Route to sales team |

The principle: AI handles the routine 80%, Ali focuses on the strategic 20%.

## Slide 8: All Five Business Scenarios Work End-to-End in the Prototype
The working prototype demonstrates every scenario from the spec with a live interactive dashboard.

Scenario A (Interested Lead): Sunrise Artisan Bakery → AI call → keyword highlighting → credit verified ($3,275 remaining) → order created → routed to Mineola Loop.

Scenario B (Drip Enrollment): Old World Bakery → "not now" response → automatic 30-day drip enrollment → appears in Drip tab with next contact date.

Scenario C (Angry Customer): The Rolling Pin → "angry" keyword detected → red alert banner → call pauses → "Alert Ali" button → human takeover.

Scenario D (Credit Exceeded): Bellmore Bread House → $375 order pushes $1,800 balance over $2,000 limit → orange block banner → financial breakdown → escalation.

Scenario E (Delivery Routing): Orders grouped by territory (Mineola Loop, Garden City Loop) → stop numbers assigned → weight tracked against 2,500 lb truck capacity.

## Slide 9: Territory-Based Routing Optimizes Deliveries for Long Island Geography
Instead of complex vehicle routing optimization, the system uses a pragmatic territory-based approach that delivers 80% of the optimization benefit at 10% of the complexity. Orders are grouped by city into territory loops (Mineola Loop, Garden City Loop), checked against truck capacity (2,500 lbs), ordered by nearest-neighbor within each loop, and then optimized via Google Maps API to minimize LIE idle time.

This approach scales to new cities by simply adding territory definitions. PostGIS enables automatic spatial clustering via ST_ClusterKMeans when manual territory definition becomes impractical at scale.

Image: Use the delivery routing flowchart showing the territory grouping and capacity check flow.

## Slide 10: The 6-Month Roadmap Prioritizes Revenue-Generating Features First
The implementation follows a clear priority order: lead sourcing and data foundation first (Months 1-2), then AI sales engine (Month 3), then automation and drip campaigns (Month 4), then logistics (Month 5), and finally the operations dashboard with testing (Month 6).

Key scaling considerations: Synchronous processing breaks at >100 calls/day (solution: BullMQ/Redis queue). Single-territory routing breaks at city #2 (solution: territory management module). Zapier drip campaigns break at >500 active campaigns (solution: custom email service). The architecture is designed to handle these transitions without schema changes.

Image: Use the Gantt chart showing the 5 implementation phases across 6 months.

## Slide 11: Technical Tradeoffs Favor Speed-to-Value Over Perfection
Every technical decision was made to maximize speed-to-value for Ali's business while keeping the architecture extensible.

| Decision | Choice | Tradeoff |
|---|---|---|
| Database | Supabase (managed PostgreSQL) | Vendor lock-in, but open-source base enables migration |
| AI Voice | Vapi (managed) | Per-minute cost, but saves 2-3 months vs custom Twilio build |
| Routing | Territory grouping | Not optimal, but 80% benefit at 10% complexity |
| Frontend | Next.js dashboard | More work than CLI, but Ali needs visual operations tool |
| Processing | Synchronous for MVP | Won't scale past 100 calls/day, but queue-ready schema |

The principle: build the simplest thing that works, but design the data model for the complex thing that comes later.

## Slide 12: The Fastest ROI Comes from AI Outbound Calling
Ali currently makes 10-15 manual calls per day. With Vapi, the system can make 50-100 calls per day at roughly $0.10-0.15 per minute. If even 10% of calls convert to orders averaging $200, that generates $1,000-2,000 per day in new revenue from a system costing $50-100/day to operate.

The second-highest ROI comes from drip campaigns: every "not now" lead that would previously be forgotten is now automatically re-engaged in 30 days. Over 6 months, this compounds into a significant pipeline of warm leads that cost nothing to re-contact.

What remains human-led: angry customer handling (empathy), credit limit overrides (financial risk), large deal negotiations (>500 lbs/month), and multi-location chain deals (complexity). AI handles volume; Ali handles value.
