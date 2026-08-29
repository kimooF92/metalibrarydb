# E-Commerce Spy App --- Feature Roadmap & Leverage Matrix

## Purpose

This document is a feature checklist to compare the current capabilities
of the existing Meta Ads spy app against the highest-leverage
capabilities needed to turn it into an **E-Commerce Market Intelligence
& Opportunity Engine**.

The core product shift is:

> **From:** "Spy on competitors and see their ads."

> **To:** "Tell me what is happening in the market, what is becoming an
> opportunity, and what I should test next."

The uploaded Lemdina dossier already demonstrates that the system can
capture verified time-series ad telemetry, product detection, product
launch timing, pricing/offers, categories, creative formats, and CTA
data. The sample tracks a brand from 2026-07-24 to 2026-08-29 with 320
active ads and 40 detected SKUs.

------------------------------------------------------------------------

# 1. Executive Priority

## The biggest E-Commerce pain point to solve

Most e-commerce operators do not primarily have a **lack of product
ideas**.

They have a **decision problem**:

-   What product should I test?
-   Is this niche actually moving or is it just noise?
-   Is a competitor genuinely scaling or simply cycling ads?
-   Is the product early, proven, saturated, or dying?
-   How much competition is entering?
-   What angle/creative/offer should I test?
-   Should I test this now or wait?
-   Which opportunity has the best risk/reward?

The app should reduce this uncertainty.

### North-star outcome

A user should be able to open the app and get:

> **"Here are the 3 best opportunities to investigate in Tunisia this
> week, why they are emerging, how strong the evidence is, what
> competition looks like, and what to test first."**

Everything else supports this outcome.

------------------------------------------------------------------------

# 2. Current Capabilities --- What We Already Have

Based on the current Lemdina intelligence output, the existing system
already appears to support:

-   [x] Brand tracking
-   [x] Meta Page identification
-   [x] Active ad count
-   [x] Historical ad-count snapshots
-   [x] Ad-count deltas
-   [x] Scaling/descaling signals
-   [x] Creative age / longevity signal
-   [x] Product detection
-   [x] Product first-seen date
-   [x] Product price
-   [x] Offer / discount detection
-   [x] Product category classification
-   [x] Niche composition
-   [x] Creative format classification
-   [x] CTA detection
-   [x] Store platform / tech-stack detection
-   [x] AI-generated strategic brand analysis

The current dossier already exposes a chronological ad timeline and
product launch timeline, which is a strong foundation for deeper
intelligence.

------------------------------------------------------------------------

# 3. Feature Priority Framework

Use the following priority levels:

### P0 --- Killer / Core Differentiator

Features that directly solve the major decision problem and should
define the product.

### P1 --- High Leverage

Features that dramatically improve the usefulness of P0 capabilities.

### P2 --- Valuable Enhancement

Useful features, but not the primary reason a user buys the product.

### P3 --- Nice to Have

Features that improve completeness but should not distract from the core
product.

------------------------------------------------------------------------

# 4. P0 --- KILLER FEATURES

## 4.1 Market Opportunity Radar

### Goal

Answer:

> **"What should I investigate/test right now?"**

### Output

For every market/niche:

-   Opportunity Score: 0--100
-   Momentum Score
-   Demand proxy
-   Competition level
-   Saturation
-   Number of active advertisers
-   New products entering
-   Ad growth
-   Product growth
-   Creative growth
-   Price range
-   Seasonality relevance
-   Evidence strength
-   Risk level

### Example

``` text
🔥 KIDS / BACK-TO-SCHOOL

Opportunity Score: 91/100
Momentum: +38%
Competition: Medium
Saturation: Low
New Product Velocity: High
Seasonal Relevance: Very High
Evidence: Strong

Why:
• More advertisers entering
• Product launches accelerating
• Related products increasing
• Seasonal demand window approaching

Action:
Investigate products solving parent/student convenience problems
in the 40–100 DT range.
```

### Why this matters

This transforms the app from a **research tool** into a **decision
tool**.

**Priority: P0 --- Highest leverage**

------------------------------------------------------------------------

# 4.2 Winning Product Detector

### Goal

Automatically identify products that deserve investigation.

Every tracked product should receive:

-   Product Opportunity Score
-   Momentum
-   Ad growth
-   Number of advertisers
-   Number of creatives
-   Creative longevity
-   Days since first seen
-   Current status
-   Lifecycle stage
-   Competition
-   Offer intensity

### Product lifecycle

``` text
NEW
 ↓
TESTING
 ↓
EMERGING WINNER
 ↓
SCALING
 ↓
MATURE
 ↓
FATIGUING
 ↓
DECLINING
```

### Product status examples

-   🆕 New
-   🧪 Testing
-   🚀 Emerging Winner
-   🏆 Scaling
-   🟡 Mature
-   ⚠️ Fatiguing
-   🔴 Declining

### Why this matters

Users currently have to manually inspect dozens or hundreds of products.

The product should answer:

> **"Which products are worth my attention?"**

**Priority: P0**

------------------------------------------------------------------------

# 4.3 Niche Momentum Engine

### Goal

Detect where the market is moving before the opportunity becomes
obvious.

For each niche calculate:

-   Product count
-   New product count
-   Active ad count
-   Ad growth
-   Brand count
-   New entrant count
-   Average product age
-   Average price
-   Creative growth
-   Offer intensity
-   Saturation
-   Momentum score

### Example

  --------------------------------------------------------------------------------
  Niche               Product    Ad Growth   New Brands   Saturation   Opportunity
                       Growth                                        
  -------------- ------------ ------------ ------------ ------------ -------------
  Kids                   High         High         High          Low            91

  Home                   High       Medium       Medium       Medium            84
  Organization                                                       

  Beauty               Medium         High         High         High            72
  --------------------------------------------------------------------------------

### Why this matters

A product may be interesting.

A **growing niche containing many future products** is much more
valuable.

**Priority: P0**

------------------------------------------------------------------------

# 4.4 Scaling Pattern Detector

Raw ad-count changes are not enough.

The system should classify the shape of the scaling curve.

### Patterns

#### Stable Scaler

``` text
120 → 135 → 150 → 170 → 190
```

#### Aggressive Scaler

``` text
150 → 220 → 340 → 500
```

#### Burst Scaler

``` text
200 → 350 → 220 → 340 → 270 → 320
```

#### Heavy Tester

``` text
100 → 130 → 110 → 160 → 120 → 150
```

#### Declining

``` text
500 → 430 → 350 → 280 → 220
```

### Important

Do not automatically label every negative delta as failure.

The Lemdina example contains repeated large expansion/contraction
cycles, including +139, -119, +120, -120, +77, -76, +46 and -46. That
pattern should be interpreted as **burst/cyclical scaling**, not simply
"decline."

### Output

``` text
SCALING STYLE
🔄 Burst Scaler

Confidence: 89%

Interpretation:
Large ad launches followed by aggressive pruning.
```

**Priority: P0**

------------------------------------------------------------------------

# 4.5 Market Saturation Detector

### Goal

Prevent users from chasing opportunities that are already overcrowded.

Calculate:

-   Number of brands
-   Number of products
-   Number of active ads
-   Growth rate
-   New entrants
-   Creative competition
-   Product duplication
-   Time-to-copy
-   Number of brands selling similar products

### Output

``` text
NICHE SATURATION

Demand: 84
Growth: 79
Competition: 91
Saturation: HIGH

Opportunity Score: 63
```

The key insight:

> High demand does not automatically mean high opportunity.

**Priority: P0**

------------------------------------------------------------------------

# 4.6 Market White Space Detector

### Goal

Find areas where market activity is growing but competition remains
relatively low.

Identify:

-   Growing niche
-   Related products increasing
-   Low direct competition
-   Low advertiser count
-   Low product duplication
-   Emerging consumer problem
-   Underrepresented price segment

### Output

``` text
🕳️ WHITE SPACE DETECTED

Niche: Home Organization

Market Momentum: +38%
Related Products: 14
Direct Competitors: 2
Saturation: Low
Opportunity: 86/100

Potential angle:
Products solving small-space organization problems
under 70 DT.
```

### Why this matters

This solves a much harder problem than "find winning products."

It helps users find:

> **Where competitors are NOT yet crowded.**

**Priority: P0**

------------------------------------------------------------------------

# 5. P1 --- HIGH-LEVERAGE FEATURES

## 5.1 Product Lifecycle Intelligence

For every product:

``` text
First Seen
   ↓
Initial Testing
   ↓
Creative Expansion
   ↓
Ad Scaling
   ↓
Peak
   ↓
Creative Replacement
   ↓
Decline
```

Track:

-   First seen
-   First ad
-   Product age
-   Peak ads
-   Current ads
-   Growth rate
-   Number of creative iterations
-   Days at peak
-   Decline velocity
-   Last seen

### Key metric

**Time-to-Scale**

How quickly a product moves from first detection to significant
advertising activity.

------------------------------------------------------------------------

# 5.2 Creative Intelligence

Move beyond:

> "79% video / 19% static / 2% carousel."

That existing format data is useful, but the next level is understanding
**what creative patterns correlate with scaling**.

Detect:

### Creative format

-   Video
-   Static
-   Carousel
-   UGC
-   Product demo
-   Testimonial
-   Problem/solution
-   Before/after
-   Offer-focused
-   Comparison
-   Demonstration

### Creative lifecycle

-   New
-   Scaling
-   Stable
-   Fatiguing
-   Replaced

### Creative pattern intelligence

``` text
WINNING CREATIVE PATTERN

Format: Product Demonstration
Usage among scaling products: High
Average longevity: 11 days
Dominant CTA: Shop Now
```

------------------------------------------------------------------------

# 5.3 Hook & Angle Intelligence

Extract recurring marketing angles:

-   Problem
-   Transformation
-   Convenience
-   Price
-   Scarcity
-   Social proof
-   Curiosity
-   Demonstration
-   Emotional
-   Authority
-   Comparison

Then identify:

> **Which angles are being used repeatedly by scaling advertisers?**

This helps answer:

> "How should I market the product?"

------------------------------------------------------------------------

# 5.4 Offer Intelligence

Track:

-   Original price
-   Current price
-   Discount %
-   Bundle
-   Quantity offer
-   Free delivery
-   Limited-time offer
-   Buy X Get Y
-   Price anchoring
-   Offer changes over time

Calculate:

**Offer Aggressiveness Score**

And:

**Offer Dependence**

Example:

``` text
Offer Dependence: HIGH

Most scaling activity is associated with
discount/bundle offers.
```

------------------------------------------------------------------------

# 5.5 Competitor DNA

Automatically profile each brand:

``` text
BRAND DNA

Business Type: Generalist
Testing Intensity: Very High
Product Breadth: Very High
Creative Churn: High
Scaling Style: Burst
Offer Dependence: Medium
Video Dependence: High
```

This lets users compare competitors without manually studying every
account.

------------------------------------------------------------------------

# 5.6 Competitor Comparison

Compare multiple brands on:

-   Active ads
-   Growth
-   Product launches
-   Niche exposure
-   Creative velocity
-   Product testing
-   Offer intensity
-   Scaling pattern
-   Product longevity

### Output

``` text
BRAND A — Aggressive Tester
BRAND B — Stable Scaler
BRAND C — Beauty Specialist
BRAND D — Generalist
```

------------------------------------------------------------------------

# 6. P1 --- TUNISIA-SPECIFIC INTELLIGENCE

## 6.1 Tunisia Commercial Calendar

Build a structured calendar around:

-   Back-to-school
-   Ramadan
-   Eid
-   Summer
-   Winter
-   Mother's Day
-   Valentine's Day
-   Father's Day
-   Wedding season
-   Exam periods
-   Seasonal weather
-   Major shopping periods

The engine should convert calendar events into **commercial relevance
windows**.

------------------------------------------------------------------------

# 6.2 Seasonal Opportunity Engine

Combine:

``` text
Historical Market Data
+
Current Market Momentum
+
Seasonality
+
Competition
+
Product Characteristics
```

### Example

``` text
BACK-TO-SCHOOL OPPORTUNITY

Seasonal relevance: 95
Market momentum: 84
Competition: 51
Product availability: 79

Opportunity: 91/100
```

This is much stronger than simply identifying currently popular
products.

------------------------------------------------------------------------

# 6.3 Historical Pattern Matching

Once enough historical data exists, detect:

> "What happened in Tunisia before similar seasonal periods?"

Examples:

-   Products that emerged before Ramadan
-   Niches that expanded before back-to-school
-   Typical product price ranges
-   Creative formats that increased
-   How early advertisers began testing

This becomes a long-term data moat.

------------------------------------------------------------------------

# 7. P1 --- AI STRATEGY LAYER

## Important architecture principle

The LLM should **not be the primary analytics engine**.

The database should calculate structured signals.

The LLM should interpret those signals and turn them into strategy.

### Data layer

Calculate:

-   Momentum
-   Growth
-   Saturation
-   Competition
-   Product lifecycle
-   Creative patterns
-   Offer intensity
-   Seasonality
-   Confidence

### AI layer

Explain:

-   Why it matters
-   What opportunity exists
-   What to investigate
-   What to test
-   What risks exist
-   What evidence supports the recommendation

------------------------------------------------------------------------

# 8. AI Opportunity Brief

The LLM should produce a concise decision brief:

``` text
OPPORTUNITY #1

Kids / Back-to-School
Score: 91/100
Confidence: Strong

WHY NOW
3–5 strongest evidence signals.

WHAT TO LOOK FOR
Product characteristics.

PRICE WINDOW
Recommended investigation range.

CREATIVE DIRECTION
Most relevant observed patterns.

COMPETITION
Low / Medium / High.

RISKS
What could invalidate the opportunity.

NEXT ACTION
What the user should investigate today.
```

------------------------------------------------------------------------

# 9. Confidence Engine

Every intelligence score should include:

### Confidence

-   Strong
-   Moderate
-   Weak

Based on:

-   Number of observations
-   Number of brands
-   Number of products
-   Historical depth
-   Signal agreement
-   Data freshness

Example:

``` text
Opportunity: 87/100
Confidence: STRONG

Evidence:
38 brands
112 products
14 days of observations
4 independent momentum signals
```

This prevents false precision.

------------------------------------------------------------------------

# 10. P2 --- ADVANCED FEATURES

## 10.1 Price Intelligence

For each niche:

-   Median price
-   Price distribution
-   Low/high price segments
-   Most common price points
-   Product price vs competition
-   Offer-adjusted price

Example:

``` text
Dominant market range:
39–79 DT

Premium segment:
90–130 DT

Best-represented segment:
49–69 DT
```

------------------------------------------------------------------------

## 10.2 Product Similarity / Duplicate Detection

Identify products that are essentially the same despite different:

-   Names
-   Languages
-   Stores
-   Product titles
-   Creative descriptions

This prevents counting the same product as multiple independent
opportunities.

------------------------------------------------------------------------

## 10.3 Brand Entry Detection

Detect when a new advertiser enters a niche.

``` text
NEW NICHE ENTRY

12 new advertisers entered
Home Organization
in the last 7 days.
```

------------------------------------------------------------------------

## 10.4 Competitor Product Adoption

Track:

> Brand A discovers Product X → Brand B → Brand C → Brand D

This can identify **product propagation velocity**.

------------------------------------------------------------------------

## 10.5 Trend Alerts

Examples:

-   "3 competitors started testing the same product."
-   "Kids niche ad activity increased 42%."
-   "A previously declining product is scaling again."
-   "A niche is approaching saturation."
-   "New competitor activity detected."

------------------------------------------------------------------------

# 11. P2 --- User Workflow Features

## Opportunity Watchlist

Users can save:

-   Products
-   Brands
-   Niches
-   Opportunities

Then track changes automatically.

------------------------------------------------------------------------

## Product Watch

Example:

``` text
WATCHING:
Mini Power Bank

First Seen: Aug 26
Current Ads: 12
Momentum: +31%
Status: Emerging
```

------------------------------------------------------------------------

## Brand Watch

Automatically notify when:

-   Ad count changes significantly
-   New product launches
-   New niche entered
-   Scaling pattern changes
-   Major creative burst occurs

------------------------------------------------------------------------

# 12. P3 --- Nice-to-Have Features

These should come later:

-   Export reports
-   PDF reports
-   Scheduled email reports
-   Team collaboration
-   Notes
-   Tags
-   Saved searches
-   Advanced filters
-   API
-   CSV export
-   Custom dashboards
-   White-label reporting

Useful, but they do not define the product.

------------------------------------------------------------------------

# 13. Recommended Dashboard Structure

## HOME --- Market Intelligence

``` text
MARKET HEALTH
74/100

MARKET MOMENTUM
+18%

NEW PRODUCTS
137

NEW ADVERTISERS
42

────────────────────────

🔥 TOP OPPORTUNITIES

1. Kids / Back-to-School      91
2. Home Organization          86
3. Beauty Accessories         79

────────────────────────

🚀 EMERGING PRODUCTS

Product A                    94
Product B                    89
Product C                    86

────────────────────────

⚠️ MARKET WARNINGS

• Beauty competition rising
• Home organization saturation increasing
• Kids product testing accelerating
```

------------------------------------------------------------------------

# 14. Brand Page

``` text
BRAND

Lemdina

HEALTH
61/100

SCALING STYLE
🔄 Burst Scaler

ACTIVE ADS
320

PRODUCTS
40

TESTING INTENSITY
Very High

CREATIVE CHURN
Very High

OFFER DEPENDENCE
Medium

────────────────────────

AD VELOCITY

[Historical chart]

────────────────────────

TOP PRODUCTS

Product A — 92
Product B — 88
Product C — 81

────────────────────────

NEW PRODUCTS

[Timeline]

────────────────────────

CREATIVE INTELLIGENCE

Video: 79%
Static: 19%
Carousel: 2%

────────────────────────

AI STRATEGY

What this competitor appears
to be doing + what it means.
```

The current Lemdina data already supports much of this structure,
including 320 active ads, 40 SKUs, historical ad velocity, product
launches, category distribution, and creative allocation.

------------------------------------------------------------------------

# 15. The Most Leverage Features --- Ranked

If development resources are limited, build these first:

## 🥇 1. Opportunity Radar

**Pain solved:**\
"I don't know what to test."

**Outcome:**\
"Show me the best opportunities."

------------------------------------------------------------------------

## 🥈 2. Winning Product Detector

**Pain solved:**\
"There are too many products to investigate."

**Outcome:**\
"Tell me which products deserve attention."

------------------------------------------------------------------------

## 🥉 3. Niche Momentum + Saturation

**Pain solved:**\
"I don't know whether this market is growing or already crowded."

**Outcome:**\
"Show me growing markets with favorable competition."

------------------------------------------------------------------------

## 4. Scaling Pattern Detector

**Pain solved:**\
"I don't know if this competitor is genuinely scaling."

**Outcome:**\
"Explain their scaling behavior."

------------------------------------------------------------------------

## 5. White Space Detector

**Pain solved:**\
"I keep entering markets after everyone else."

**Outcome:**\
"Show me emerging areas with relatively low competition."

------------------------------------------------------------------------

## 6. Tunisia Seasonal Opportunity Engine

**Pain solved:**\
"I don't know what will be relevant next month."

**Outcome:**\
"Tell me what market opportunities are likely to become relevant soon."

------------------------------------------------------------------------

## 7. AI Action Brief

**Pain solved:**\
"I have data but don't know what to do with it."

**Outcome:**\
"Turn the data into a concrete testing plan."

------------------------------------------------------------------------

# 16. What NOT to Prioritize

Avoid spending too much development time initially on:

-   More filters
-   More charts
-   More raw ad tables
-   More scraping volume without interpretation
-   Generic AI chat
-   Fancy dashboards
-   Long AI reports
-   Cosmetic UI features

The product should not win because it has **more data**.

It should win because it makes the user **make better decisions
faster**.

------------------------------------------------------------------------

# 17. The Core Product Loop

The ideal product loop is:

``` text
COLLECT
Meta Ads + Brands + Products + Creatives
        ↓
STRUCTURE
Product / Niche / Creative / Offer classification
        ↓
MEASURE
Momentum / Scaling / Competition / Saturation
        ↓
DETECT
Winners / Trends / White Space / Risks
        ↓
CONTEXTUALIZE
Seasonality + Tunisia market context
        ↓
RANK
Opportunity Score + Confidence
        ↓
EXPLAIN
AI strategic interpretation
        ↓
ACT
"What should I test?"
        ↓
TRACK
Did the opportunity continue growing?
        ↓
LEARN
Improve future opportunity scoring
```

------------------------------------------------------------------------

# 18. Long-Term Moat

The most defensible asset is not the AI prompt.

It is the accumulated historical dataset.

Over time the system can learn:

-   Which products tend to scale
-   How long products survive
-   Which niches emerge
-   How quickly competitors copy products
-   Which price ranges work in each niche
-   How seasonal demand changes advertiser behavior
-   Which creative patterns correlate with persistence
-   Which signals predict opportunity vs noise

Eventually the product can move from:

> **"Here is what the market is doing."**

to:

> **"Based on thousands of historical observations, here is what is
> likely to happen next."**

That is the real end state.

------------------------------------------------------------------------

# 19. Final Product Positioning

### Current

**Meta Ads Spy**

> Find competitor ads and products.

### Next

**E-Commerce Market Intelligence**

> Understand competitors, products, niches, and market momentum.

### Ultimate

# AI E-Commerce Opportunity Engine

> **Find the next market opportunity before it becomes obvious.**

The north-star metric should therefore not be:

**Number of ads scraped.**

It should be:

> **Number of high-confidence opportunities discovered that lead to a
> worthwhile product test.**

That is the big E-Commerce pain point the product can own.
