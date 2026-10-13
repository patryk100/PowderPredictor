# PowderPredictor Meteorological Modeling Engine

PowderPredictor bridges the gap between coarse numerical weather prediction (NWP) model grids (e.g. NOAA GFS at 13km or HRRR at 3km resolution) and steep, complex alpine topography across the Northeast Appalachian / Green / White / Adirondack ranges.

---

## 1. Topographic Downscaling & Lapse Rate

Coarse weather models average terrain elevation over square kilometers, routinely smoothing 4,000 ft peaks down by 1,000–2,000 ft. PowderPredictor re-projects atmospheric sounding columns onto true high-resolution digital elevation models (DEM).

### 1.1 Moist Adiabatic Lapse Rate (MALR)
When air is saturated (relative humidity $\ge 90\%$) and forced up mountain terrain (orographic lift), temperature decreases according to the Moist Adiabatic Lapse Rate:

$$\Gamma_m = g \frac{1 + \frac{L_v r}{R_d T}}{c_{pd} + \frac{L_v^2 r}{R_v T^2}}$$

In our operational engine, this is parametrized between $4.5^\circ\text{C}/\text{km}$ ($2.5^\circ\text{F} / 1000\text{ft}$) in warm, moist maritime sectors and $6.5^\circ\text{C}/\text{km}$ ($3.6^\circ\text{F} / 1000\text{ft}$) in cold continental arctic fronts.

```
Summit (3,968 ft)  ---- T_summit = 18°F  [Blower Snow, DGZ active]
                         ^
                         |  Moist Adiabatic Lapse Rate (-3.6°F / 1000ft)
                         |
Mid-Mtn (2,800 ft) ---- T_mid = 22°F     [Dense Pack Snow]
                         ^
                         |
Freezing Line (1,800 ft)================= T_freeze = 32°F
                         |
Base (1,200 ft)    ---- T_base = 34°F    [Rain / Mixed Slush]
```

### 1.2 Multi-Tier Elevation Profiles
Each mountain is partitioned into three vertical evaluation nodes:
1. **Base Elevation ($z_{\text{base}}$)**: Parking lot and lower lift terminal. Evaluated for rain/snow transition and mud/crust risk.
2. **Mid Elevation ($z_{\text{mid}}$)**: Mountain median contour. Represents core trail terrain and ski area tree line.
3. **Summit Elevation ($z_{\text{summit}}$)**: Highest lift-serviced peak or ridgeline. Evaluated for rime ice, maximum snowfall, and wind exposure.

---

## 2. Snow-to-Liquid Ratio (SLR) & Crystal Physics

Standard weather forecasts assume a flat $10:1$ ratio (1 inch of liquid water equals 10 inches of snow). Northeast snow density varies wildly from $4:1$ ("mashed potatoes") to $25:1$ ("blower powder").

### 2.1 The Dendritic Growth Zone (DGZ)
The highest quality powder crystals (stellar dendrites) form exclusively when ascending saturated air falls within the **Dendritic Growth Zone**:

$$-18^\circ\text{C} \le T_{\text{cloud}} \le -12^\circ\text{C} \quad (0^\circ\text{F} \le T \le 10^\circ\text{F})$$

When the cloud condensation layer and summit temperature align with the DGZ:
* Vapor deposition produces large hexagonal crystal arms with high interstitial air volume.
* Snow-to-Liquid Ratio rises to $15:1 – 22:1$.
* Crystal riming is minimized due to low supercooled liquid water droplet collision.

If temperatures fall outside the DGZ:
* $T > -10^\circ\text{C}$ ($> 14^\circ\text{F}$): Plates, columns, and rimed pellets form ($7:1 – 11:1$).
* $T < -20^\circ\text{C}$ ($< -4^\circ\text{F}$): Needles and bullet rosettes form, creating wind-packed sand-like snow ($10:1 – 12:1$).

---

## 3. Orographic Aspect & Wind Redistribution

Northeast winter storms typically feature cyclonic coastal tracks (Nor'easters) with prevailing winds rotating from East/Southeast to Northwest.

```
Wind Direction (NW) --->  [  W/NW Aspect  ]  Summit Ridge  [  E/SE Aspect  ]
                          (Windward / Scour)               (Leeward / Deposition)
                          Crust & Hardpack                 Loaded Powder Stashes
```

### 3.1 Windward Scour vs. Leeward Deposition
* **Scoured Aspects**: Slopes facing directly into sustained winds ($> 25\text{ mph}$) experience snow stripping, mechanical crystal fragmentation, and rime crust formation.
* **Loaded Aspects**: Sheltered leeward slopes receive cross-ridge deposition, frequently yielding $1.5\times – 2.0\times$ the snowfall measured at flat reporting stations.

### 3.2 Wind Hold Risk Index
Calculated dynamically from forecasted summit gusts:
* **Gusts $< 30\text{ mph}$**: Low hold risk ($0–25$). Normal lift operations.
* **Gusts $30–45\text{ mph}$**: Moderate risk ($25–60$). Detachable summit quads and gondolas placed on slow speeds or standby.
* **Gusts $> 45\text{ mph}$**: High risk ($> 60$). Summit lifts on wind hold; skiing restricted to lower mountain fixed-grip chairs.

---

## 4. The Powder Score Algorithm (0–100)

The Powder Score provides a unified, normalized quality metric combining quantity, density, thermal crust risk, and terrain feasibility:

```
PowderScore = (S_depth * 0.35) + (S_slr * 0.25) + (S_temp * 0.15) 
            + (S_base * 0.15) - (P_wind + P_crust)
```

### Score Components
1. **Accumulation Score ($S_{\text{depth}}$)**:
   - Evaluates 48-hour predicted snowfall: $0" \to 0\text{ pts}$, $6" \to 50\text{ pts}$, $12"+ \to 100\text{ pts}$.
2. **Quality / SLR Score ($S_{\text{slr}}$)**:
   - Peaks at $16:1 – 20:1$ ($100\text{ pts}$). Penalizes wet heavy snow ($< 8:1$) and wind-sheared cold ice ($> 25:1$).
3. **Thermal Profile ($S_{\text{temp}}$)**:
   - Rewards summit and mid-mountain temperatures sustaining un-melted crystalline structures.
4. **Base Depth Multiplier ($S_{\text{base}}$)**:
   - Scaled by existing natural base depth to guarantee that early season grass or bare rock does not yield an artificially high score.
5. **Penalties**:
   - **Wind Hold Penalty ($P_{\text{wind}}$)**: Deducts up to $25\text{ pts}$ if summit lifts are projected to shut down.
   - **Thermal Rain / Crust Penalty ($P_{\text{crust}}$)**: Deducts up to $30\text{ pts}$ if liquid precipitation fell over the snowpack during the storm lifecycle.

### Rating Tiers
* **`85 – 100` (EPIC)**: Deep storm totals ($12"+$), high SLR ($> 15:1$), protected glades primed, low wind holds.
* **`70 – 84` (GREAT)**: Solid snowfall ($6–12"$), excellent packed powder, minor ridgeline wind.
* **`50 – 69` (FAIR)**: Light accumulations ($2–5"$) or denser snow requiring wide ski flotation.
* **`< 50` (LOW)**: Minimal snow, rain/thaw transitions, or early season off-season conditions.
