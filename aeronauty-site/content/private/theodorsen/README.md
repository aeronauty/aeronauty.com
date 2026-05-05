# Theodorsen Lab

Private working area for an interactive technical piece on Theodorsen, unsteady lift, and the model ladder from quasi-steady / potential-flow ideas to Flow360 RANS, URANS, LES, and DDES.

## Generate Seed Data

```bash
python3 -m pip install flexfoil scipy numpy
python3 content/private/theodorsen/scripts/generate_quasi2d_data.py
```

The generated JSON intentionally distinguishes:

- `theodorsen`: numerical Hankel-function evaluations of \(C(k)\).
- `quasiSteady`: FlexFoil 2D section polar and fitted lift slope.
- `flow360Ladder`: a planned comparison schema for later CFD results.

The first lab page does not claim that Flow360 cases have been run. It sets up the shape of the comparison so actual RANS/URANS/LES/DDES data can be dropped in later.
