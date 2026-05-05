# The Wing Remembers

There is a particular class of aerodynamic result that looks like a small correction until you build something that moves.

A wing at a steady angle of attack is already complicated enough. The pressure field has to arrange itself around the section, the trailing edge has to satisfy the Kutta condition, the wake has to take away the circulation it is owed, and everyone involved pretends that drawing a tidy streamline picture makes this emotionally manageable.

Now make the wing oscillate.

Not violently. Just pitch it a few degrees, or plunge it up and down, or let an elastic mode flex it at some frequency. The lift no longer follows the motion directly. It lags. Its amplitude changes. The wake you shed half a cycle ago is still out there, convecting downstream, still inducing velocity back on the airfoil. The wing is not responding only to where it is now. It is responding to where it has been.

That is the core idea of this piece:

**Unsteady lift is aerodynamic memory.**

And Theodorsen's function, \(C(k)\), is one of the great early acts of compressing that memory into something engineers can actually use without giving up and becoming accountants.

[VIDEO: flutter]

Flutter is the dramatic version, which is why it usually gets the thumbnail. A structure bends or twists, the aerodynamic load arrives with just the wrong phase, energy is fed into the motion rather than taken out, and the oscillation grows. It is not "the wind is strong" in any simple sense. It is a feedback problem. The airflow is doing work on the structure because the timing is wrong.

Theodorsen matters because timing is the whole game.

## The Steady Picture Is Too Forgiving

Most aerodynamic teaching starts with the steady problem, and that is fair. If an airfoil sits at a fixed angle of attack in a steady flow, thin-airfoil theory gives the famous lift slope:

[MATHS]
For a thin symmetric airfoil in incompressible attached flow,

\[
C_L \approx 2\pi \alpha
\]

with \(\alpha\) in radians. More generally, a real section gets a measured or computed lift slope, a zero-lift offset, viscous corrections, and eventually a polite note from separation explaining that the linear model has had a lovely time but needs to go home.
[/MATHS]

That steady result is useful. It is also a trap.

The trap is the word "the." The lift. The circulation. The wake. In the steady cartoon these are nouns, already arranged. In the unsteady problem they are verbs. The circulation is being built. The wake is being shed. The airfoil is moving while the flow is still adjusting to the last thing it did.

[VIDEO: circulation-starting-vortex]

The starting vortex is the cleanest way to see the crime scene. Start an airfoil impulsively and the bound circulation cannot simply appear on the airfoil by administrative decree. A vortex is shed into the wake so total circulation is conserved. The airfoil gets bound circulation; the wake gets the opposite bookkeeping entry. Aerodynamics, unlike project management, does not allow you to hide the accounting error in a spreadsheet.

That shed vorticity does not disappear because the airfoil has moved on. It convects downstream and continues to induce velocity. Every new change in bound circulation leaves another trace in the wake. The present lift depends on the accumulated wake history.

[WIDGET: starting-vortex-memory]

The widget should make the point visually: a sudden motion leaves a coherent wake structure behind it; later motion happens in the induced field of that earlier event. If the wing "remembers", this is the memory. Not mysticism. Vorticity.

## Wagner's Problem: The Step Response

Before the harmonic version, there is the step version.

Imagine an airfoil that is suddenly put at a small angle of attack. The quasi-steady answer would jump immediately to \(2\pi\alpha\). The real unsteady inviscid answer does not. It approaches the steady value gradually because the wake is being formed and carried away.

This is Wagner's function: the indicial lift response to a step change in angle of attack. It says, roughly, "how much of the steady circulatory lift has arrived by this nondimensional time?"

The point is not the exact curve yet. The point is that a simple step input has a history-dependent output.

[ANALOGY]
Think of turning a large ship, not because fluid mechanics needs a second fluid metaphor but because sometimes the obvious crime is the right one. You can move the rudder now, but the ship's response contains the inertia of what it was already doing. An airfoil's unsteady lift has a different mechanism, but the same warning label: a control input is not the same thing as an instantaneous state change.
[/ANALOGY]

For a general motion, the circulatory lift can be written as a history integral. Each past change in effective angle of attack contributes to the current lift, weighted by how old that change is.

[WIDGET: lift-history-integral]

This is an elegant statement and a miserable way to do repetitive engineering calculations by hand. If every sinusoidal motion requires dragging the entire past wake history around, the algebra becomes a shed full of rakes. Step on one and another one hits you.

Theodorsen's move was to ask a different question:

If the motion is harmonic, can the whole wake-memory operator collapse into a complex multiplier?

The answer is yes. That answer is \(C(k)\).

## Reduced Frequency Is The Knob

The unsteady problem needs a nondimensional frequency. The usual one is reduced frequency,

[MATHS]
\[
k = \frac{\omega b}{U}
\]

where \(\omega\) is the angular frequency of the motion, \(b\) is the semichord, and \(U\) is the freestream speed.
[/MATHS]

Reduced frequency compares the time it takes the airfoil to move with the time it takes the flow to cross the airfoil. Low \(k\) means the flow sees the motion as slow. High \(k\) means the airfoil is changing appreciably before the wake from the previous change has gone very far.

[WIDGET: reduced-frequency]

This is one of those parameters that is simple enough to define and subtle enough to spend a career misusing. It is not just "frequency". A large slow aircraft mode and a small fast section oscillation can land in similar places once scaled by chord and speed. The wake cares about that scaled timing, not the calendar frequency you happened to write in the test plan.

At \(k \to 0\), Theodorsen's function tends toward 1: the circulatory lift is essentially quasi-steady. At higher \(k\), the magnitude drops and the phase becomes more negative: the lift is smaller than the quasi-steady prediction and arrives late.

That sounds like a correction factor. It is not quite. It is a compressed memory model.

## Harmonic Collapse

Here is the outrageously useful thing about sinusoids: linear systems treat them as eigenfunctions. Put in a sinusoid, get out a sinusoid at the same frequency, with changed amplitude and phase. The entire convolution with the wake can be represented by a complex gain.

[WIDGET: harmonic-collapse]

This is the collapse:

[MATHS]
For harmonic motion, write the effective angle of attack as

\[
\alpha_\mathrm{eff}(t) = \Re\{\hat{\alpha} e^{i\omega t}\}.
\]

The circulatory lift contribution can be represented, schematically, as

\[
\hat{C}_{L,\mathrm{circ}} =
2\pi C(k)\hat{\alpha}_\mathrm{eff}.
\]

Theodorsen's function is complex:

\[
C(k) = F(k) + iG(k).
\]

\(F(k)\) changes the in-phase component. \(G(k)\) changes the quadrature component. Together they encode amplitude reduction and phase lag.
[/MATHS]

In the classical thin-airfoil result, Theodorsen found

[MATHS]
\[
C(k)=
\frac{H_1^{(2)}(k)}
{H_1^{(2)}(k) + iH_0^{(2)}(k)}
\]

where \(H_n^{(2)}\) are Hankel functions of the second kind.
[/MATHS]

This is a good place to say something unfashionable but important: this is not "a simple formula" in the sense that a hand calculator feels simple. It is a compact special-function representation of a wake boundary-value problem. The beauty is not that it is elementary. The beauty is that the unsteady wake has been reduced to a function of one nondimensional parameter.

[WIDGET: ck-response]

The widget should show \(F(k)\), \(G(k)\), \(|C(k)|\), and phase. The important behaviour is qualitative:

- near zero reduced frequency, \(C(k)\) is close to 1;
- as \(k\) increases, the magnitude falls;
- the imaginary part creates phase lag;
- at very high \(k\), the circulatory contribution tends toward a limiting value rather than behaving like a steady airfoil with caffeine.

The lift has not vanished. The circulatory part has changed. There are also non-circulatory or apparent-mass terms, which are not multiplied by \(C(k)\). That distinction matters, especially in pitch and plunge.

## Pitch, Plunge, And The Slightly Annoying Location Of Things

An oscillating airfoil has more than one way to move.

It can plunge: move up and down without changing pitch angle. It can pitch: rotate about an axis. It can do both, which is what a bending-torsion wing section effectively does once you reduce it to a typical-section model.

[WIDGET: pitch-plunge]

The effective angle of attack is not just the geometric pitch angle. It includes plunge velocity, pitch rate, and the location of the pitch axis relative to the mid-chord. This is where the expressions become less blog-friendly and more honest.

[MATHS]
For a typical airfoil section with plunge \(h(t)\), pitch \(\alpha(t)\), semichord \(b\), freestream \(U\), and pitch-axis location \(a b\) measured from the mid-chord, the effective circulatory input has the shape

\[
\alpha_\mathrm{eff}
\sim
\alpha + \frac{\dot{h}}{U}
 b\left(\frac{1}{2}-a\right)\frac{\dot{\alpha}}{U}.
\]

Different sign conventions move minus signs around. Aerospace has survived worse, but only just.
[/MATHS]

That effective input gets multiplied by \(C(k)\) for the circulatory part. The apparent-mass part depends on accelerations and does not wait for the wake. In aeroelastic equations, both appear in the generalized aerodynamic forces.

This is why Theodorsen remains useful long after you can run CFD. It gives you a clean way to separate:

- the part of the load that follows from accelerating fluid locally;
- the part of the load carried by circulation and wake memory;
- the way phase changes with reduced frequency.

You can then ask whether a higher-fidelity model is changing the answer because of viscosity, separation, compressibility, thickness, three-dimensionality, turbulence modelling, or because you were previously using the wrong unsteady memory.

That is a better question than "does CFD match theory?", which is often a fancy way of asking whether a racing bicycle matches a drawing of a wheel.

## Why This Matters For Flutter

Flutter is a structural-aerodynamic energy exchange problem. If the aerodynamic force is in the right phase, it damps the motion. If it is in the wrong phase, it feeds the motion.

The scary part is that "wrong phase" can be a modest-looking shift. A few degrees of aerodynamic lag in the right coordinate can move a mode from damped to unstable. The airplane does not care that the plot looked nearly the same in PowerPoint.

Theodorsen's function enters classical flutter analysis because it gives the unsteady aerodynamic forces for harmonic motion. Combine those forces with a structural model and solve for the complex frequency where the system can sustain itself. The flutter boundary appears where damping crosses zero.

[ANALOGY]
Imagine pushing a child on a swing. Push at the bottom in the direction of motion and you add energy. Push with the wrong timing and you remove it, or mostly look foolish. Flutter is the aircraft version, except the person doing the pushing is the pressure field and the child is a wing whose certification paperwork would prefer not to become confetti.
[/ANALOGY]

Theodorsen did not make flutter easy. He made an essential part of the aerodynamic timing computable.

## The Short Derivation, With The Usual Crimes Hidden In The Basement

[DETAILS: derivation-short-form]

We can sketch the derivation without pretending that a few paragraphs replace the NACA report.

Start with incompressible, inviscid, two-dimensional potential flow around a thin airfoil. The airfoil is allowed to execute small harmonic pitch and plunge motions. Because the problem is linearized, the velocity potential can be split into non-circulatory and circulatory parts.

The non-circulatory part is local apparent mass. It comes from accelerating the fluid around the body and depends directly on accelerations. It does not require a shed wake to communicate the past.

The circulatory part is constrained by the Kutta condition at the trailing edge and by the vorticity shed into the wake. A change in bound circulation must be accompanied by vorticity in the wake, convecting downstream with the freestream in the thin-airfoil approximation. For harmonic motion, the wake vorticity distribution also varies harmonically. That lets the integral influence of the wake be represented in the frequency domain.

Solving the resulting integral equation gives a relationship between the bound circulation and the harmonic motion. The wake influence appears through Hankel functions. With the common reduced-frequency convention \(k=\omega b/U\), the circulatory correction becomes

\[
C(k)=
\frac{H_1^{(2)}(k)}
{H_1^{(2)}(k) + iH_0^{(2)}(k)}.
\]

The lift and moment expressions then combine apparent-mass terms with circulatory terms multiplied by \(C(k)\). The exact signs and coefficients depend on the pitch-axis convention and the coordinate direction for plunge, which is why every serious aeroelasticity text starts by defining those before doing anything interesting.

The derivation is not a proof that real air behaves like thin inviscid potential flow. It is a proof that, under those assumptions, wake memory for harmonic motion has a precise frequency response.

[/DETAILS]

## The Model Ladder

Theodorsen is not the last word. It is the first honest word in a ladder.

[WIDGET: model-ladder]

The ladder I want for this article has five rungs:

1. **Quasi-steady section model.** Use a steady lift slope or a FlexFoil/XFOIL-style polar and assume the lift follows motion instantly. Cheap, useful, wrong as soon as wake timing matters.
2. **Theodorsen plus quasi-steady section data.** Use a real or computed lift slope for the section, then apply Theodorsen's wake-memory response for harmonic attached-flow motion. Still idealized, but now the timing is in the room.
3. **Flow360 RANS.** Solve a steady viscous mean-flow problem. Useful for the baseline section aerodynamics, pressure recovery, and separated steady states. Not time-accurate wake memory.
4. **Flow360 URANS.** Solve a time-accurate mean-flow problem with modelled turbulence. This is the practical comparison for oscillating-airfoil loops when the motion is not too pathological.
5. **Flow360 LES/DDES.** Resolve more of the unsteady separated wake physics. Expensive, sensitive to mesh and timestep, and not a magic truth machine. But when separation, vortex shedding, or dynamic stall is the story, this is where the story has to go.

The current private lab scaffold seeds the first two pieces: numerical Hankel-function values for \(C(k)\), and a FlexFoil quasi-steady NACA 0012 polar used as a low-order section reference. The Flow360 rows are deliberately a schema, not a claim. No Flow360 comparison should be implied until the cases exist.

This matters because the ladder is not about declaring a winner. It is about asking what each model remembers.

Quasi-steady remembers the current state and forgets the wake. Theodorsen remembers the inviscid attached wake, but forgets viscosity and separation. RANS remembers viscous mean-flow structure, but forgets resolved unsteady history. URANS remembers time-varying modelled flow. LES and DDES remember more of the wake, if the grid, timestep, and modelling choices deserve that verb.

"What does this model remember?" is the question that prevents model hierarchy from becoming brand warfare.

## What The Widgets Should Teach

The article should not use the interactive pieces as decoration. Each one has a job.

**Starting vortex memory** should make the wake visible as the storage medium. The reader should see that a change in circulation leaves something downstream.

**Lift history integral** should connect that visual wake to the convolution idea: current lift is an accumulated effect of past motion.

**Harmonic collapse** should show why harmonic motion is special: the ugly history integral becomes a complex gain.

**Reduced frequency** should give the reader a physical feel for \(k\), not merely the equation.

**The \(C(k)\) response** should make the frequency-response behaviour of \(C(k)\) unavoidable: amplitude and phase change together.

**Pitch and plunge** should show why a typical section has coupled motion inputs, and why pitch-axis location matters.

**The model ladder** should stop the article from becoming a museum piece. The point is not that Theodorsen replaces CFD. The point is that Theodorsen gives us a clean mental coordinate system for interrogating CFD.

## The Dry Moral

Theodorsen's function is sometimes taught like a historical curiosity: here is an old special function from an old report, please admire the notation and move on. That undersells it.

The real achievement is architectural. Theodorsen took an unsteady wake-memory problem and turned it into a frequency response. Once you have that, you can talk about amplitude, phase, damping, flutter, and model comparison in a compact engineering language.

That is still the right language, even when the next tool in the chain is a very expensive CFD run.

The modern mistake is to treat high-fidelity simulation as a solvent that dissolves low-order thinking. It does not. It gives you more detailed answers. You still need to know what question you asked, what physics the model could remember, and which missing memory is likely to hurt you.

The wing remembers. Theodorsen tells you how much of that memory survives into a harmonic lift response. CFD can tell you what happens when the tidy assumptions fall apart. The useful engineer keeps both thoughts in his head at once, which is inconvenient but cheaper than learning about phase lag from a flutter test.

[REFERENCES]
