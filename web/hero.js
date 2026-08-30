// Draws the three connectors (Scan, Enhance, Contribute) between the
// hero diagram's three independently-scaling components. Every arrow is
// computed live from each component's own current on-screen position,
// in one overlay SVG pair, so it always attaches to the right sub-part
// of the right component regardless of how the flex layout has reflowed
// (row on a wide viewport, column below the breakpoint in style.css'
// .hero-flow rules).

// Maps a named anchor point (a near-zero-radius circle placed inside a
// component's own SVG) to real page pixel coordinates. Uses the anchor's
// own getScreenCTM() rather than hand-computing viewBox scale, because
// several anchors (the two photo centers) live INSIDE a rotated <g> --
// a plain viewBox-scale calculation ignores that rotation and would
// place the beam targets in the wrong spot. getScreenCTM() folds in
// every ancestor transform (rotation included) plus the SVG's own
// viewBox scaling, so this is correct regardless of where an anchor
// sits in the tree.
function anchorPagePoint(anchorId) {
  const anchor = document.getElementById(anchorId);
  if (!anchor) return null;
  const svg = anchor.ownerSVGElement;
  const pt = svg.createSVGPoint();
  pt.x = parseFloat(anchor.getAttribute('cx'));
  pt.y = parseFloat(anchor.getAttribute('cy'));
  const screenPt = pt.matrixTransform(anchor.getScreenCTM());
  return { x: screenPt.x, y: screenPt.y };
}

function drawHeroConnectors() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return; // hero diagram isn't on this page
  const overlayRect = overlay.getBoundingClientRect();
  const svg = document.getElementById('overlaySvg');
  const backSvg = document.getElementById('overlayBackSvg');
  const isRow = getComputedStyle(document.getElementById('flow')).flexDirection === 'row';
  const suffix = isRow ? 'row' : 'col';

  const toLocal = (p) => ({ x: p.x - overlayRect.left, y: p.y - overlayRect.top });
  const photo1 = toLocal(anchorPagePoint('anchor-photo1'));
  const photo2 = toLocal(anchorPagePoint('anchor-photo2'));
  const blaydeIn = toLocal(anchorPagePoint(`anchor-blayde-in-${suffix}`));
  const blaydeOut = toLocal(anchorPagePoint(`anchor-blayde-out-${suffix}`));
  const newIn = toLocal(anchorPagePoint(`anchor-new-in-${suffix}`));
  const newOut = toLocal(anchorPagePoint('anchor-new-out'));
  const communityIn = toLocal(anchorPagePoint(`anchor-community-in-${suffix}`));
  const githubClear = toLocal(anchorPagePoint('anchor-github-clear'));
  const pyramidRect = document.getElementById('pyramid').getBoundingClientRect();
  const pyramidRight = pyramidRect.right - overlayRect.left;
  const pyramidLeft = pyramidRect.left - overlayRect.left;

  svg.setAttribute('viewBox', `0 0 ${overlayRect.width} ${overlayRect.height}`);
  backSvg.setAttribute('viewBox', `0 0 ${overlayRect.width} ${overlayRect.height}`);

  // Enhance routes around the pyramid's OUTSIDE edge (right in row layout,
  // bottom-right swing in column layout) so it never crosses Community or
  // GitHub, no matter which orientation is active. The final control
  // point is pinned level with (row) or directly above (col) the arrival
  // point, so the tangent at the very end is a straight horizontal/
  // vertical approach INTO the document rather than a diagonal skim
  // across its edge.
  // Column layout specifically routes through an explicit waypoint just
  // past GitHub's bottom-right corner, with the waypoint's two flanking
  // control points sitting symmetrically above and below it (both at
  // x=enhanceWayX) so the incoming and outgoing tangents point the same
  // direction there -- a single curve straight from Blayde-Manual-out to
  // New-Manual-in would cut back left while still inside GitHub's
  // vertical span, slicing through the box.
  const enhanceWayX = pyramidRight + 50;
  const enhanceBend = Math.max(90, (githubClear.y - blaydeOut.y) * 0.35);
  const enhancePath = isRow
    ? `M ${blaydeOut.x} ${blaydeOut.y} C ${blaydeOut.x + 60} ${blaydeOut.y + 10}, ${newIn.x - 70} ${newIn.y}, ${newIn.x} ${newIn.y}`
    : `M ${blaydeOut.x} ${blaydeOut.y} C ${enhanceWayX} ${blaydeOut.y}, ${enhanceWayX} ${githubClear.y - enhanceBend}, ${enhanceWayX} ${githubClear.y} C ${enhanceWayX} ${githubClear.y + enhanceBend}, ${newIn.x} ${newIn.y - 70}, ${newIn.x} ${newIn.y}`;

  // Tractor-beam cone: a quadrilateral from a wide end (w1, at the photo)
  // to a narrower end (w2, at the convergence point), so the two long
  // edges read as the beam's own hard boundary lines.
  function beamPolygon(p1, w1, p2, w2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const a1 = { x: p1.x + nx * w1 / 2, y: p1.y + ny * w1 / 2 };
    const a2 = { x: p1.x - nx * w1 / 2, y: p1.y - ny * w1 / 2 };
    const b1 = { x: p2.x + nx * w2 / 2, y: p2.y + ny * w2 / 2 };
    const b2 = { x: p2.x - nx * w2 / 2, y: p2.y - ny * w2 / 2 };
    return { points: `${a1.x},${a1.y} ${b1.x},${b1.y} ${b2.x},${b2.y} ${a2.x},${a2.y}`, a1, a2, b1, b2 };
  }
  const beam1 = beamPolygon(photo1, 46, blaydeIn, 10);
  const beam2 = beamPolygon(photo2, 46, blaydeIn, 10);

  // Community's anchor moved (right edge in row, left edge in col), so the
  // approach curve needs different control points per layout to still
  // arrive cleanly. In column layout specifically, the curve is pushed
  // out past the pyramid's own LEFT edge (not just Community's), so it
  // clears GitHub's box underneath instead of cutting across it.
  const contributeC1 = isRow
    ? { x: (newOut.x + communityIn.x) / 2, y: newOut.y + 45 }
    : { x: pyramidLeft - 70, y: newOut.y - 30 };
  const contributeC2 = isRow
    ? { x: (newOut.x + communityIn.x) / 2, y: communityIn.y - 15 }
    : { x: pyramidLeft - 70, y: communityIn.y };
  const contributePath = `M ${newOut.x} ${newOut.y} C ${contributeC1.x} ${contributeC1.y}, ${contributeC2.x} ${contributeC2.y}, ${communityIn.x} ${communityIn.y}`;

  // In row layout Contribute's arrow points LEFT (Community sits left of
  // Your Manual), so the path itself runs right-to-left -- SVG renders
  // textPath glyphs upside down on a nearly-horizontal right-to-left
  // path. The visible stroked path/arrow/animateMotion still use
  // contributePath as-is; only the label rides this separate,
  // geometrically identical path traversed in the opposite direction so
  // it reads left-to-right. Column layout's path is nearly vertical
  // instead, where this same left/right flip isn't visually legible as
  // "upside down" either way, so it's left exactly as before (unreversed).
  const contributeNeedsReversal = isRow && newOut.x > communityIn.x;
  const contributeTextPath = contributeNeedsReversal
    ? `M ${communityIn.x} ${communityIn.y} C ${contributeC2.x} ${contributeC2.y}, ${contributeC1.x} ${contributeC1.y}, ${newOut.x} ${newOut.y}`
    : contributePath;
  const contributeTextOffset = contributeNeedsReversal ? '55%' : '45%';

  // ---- back layer: only the scan beams -- sits BEHIND the manual cards
  // (see .connector-overlay-back's z-index in style.css), so the short
  // stretch of beam that would otherwise overlap Old Manual's paper tucks
  // under it instead of drawing on top -- reads as pulling the photo up
  // from underneath. The rest of each beam's length (the majority of it,
  // traveling through open space to Blayde Manual) is completely
  // unaffected, so the effect fully survives the move. ----
  backSvg.innerHTML = `
    <defs>
      <filter id="beamGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <path id="beam1Center" d="M ${photo1.x} ${photo1.y} L ${blaydeIn.x} ${blaydeIn.y}"/>
    </defs>
    <g class="beam-pulse">
      <polygon points="${beam1.points}" fill="#c8102e" fill-opacity="0.22"/>
      <polygon points="${beam2.points}" fill="#c8102e" fill-opacity="0.22"/>
      <line x1="${beam1.a1.x}" y1="${beam1.a1.y}" x2="${beam1.b1.x}" y2="${beam1.b1.y}" stroke="#ff2f47" stroke-width="2" filter="url(#beamGlow)"/>
      <line x1="${beam1.a2.x}" y1="${beam1.a2.y}" x2="${beam1.b2.x}" y2="${beam1.b2.y}" stroke="#ff2f47" stroke-width="2" filter="url(#beamGlow)"/>
      <line x1="${beam2.a1.x}" y1="${beam2.a1.y}" x2="${beam2.b1.x}" y2="${beam2.b1.y}" stroke="#ff2f47" stroke-width="2" filter="url(#beamGlow)"/>
      <line x1="${beam2.a2.x}" y1="${beam2.a2.y}" x2="${beam2.b2.x}" y2="${beam2.b2.y}" stroke="#ff2f47" stroke-width="2" filter="url(#beamGlow)"/>
    </g>
    <!-- SCAN rides beam 1's own centerline instead of floating separately,
         offset close to the Blayde Manual (convergence) end -->
    <text font-size="14" font-weight="700" letter-spacing="0.06em" fill="#ff8a95">
      <textPath href="#beam1Center" startOffset="72%">SCAN</textPath>
    </text>
  `;

  // ---- front layer: enhance + contribute, unchanged z-order (on top) ----
  svg.innerHTML = `
    <defs>
      <marker id="arrowEnhance" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#ff3b52"/></marker>
      <marker id="arrowContribute" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#7fd8c4"/></marker>
      <linearGradient id="enhanceGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5468"/><stop offset="1" stop-color="#c8102e"/></linearGradient>
      <linearGradient id="contributeGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c7fff0"/><stop offset="1" stop-color="#4fb89e"/></linearGradient>
      <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>

    <!-- ENHANCE: thicker, redder, urgent -- its own label rides the curve -->
    <path id="enhancePathEl" d="${enhancePath}" fill="none" stroke="url(#enhanceGrad)" stroke-width="4" stroke-linecap="round" filter="url(#glow)" marker-end="url(#arrowEnhance)"/>
    <text font-size="14" font-weight="700" letter-spacing="0.04em" fill="#ffd0d6">
      <textPath href="#enhancePathEl" startOffset="42%">ENHANCE</textPath>
    </text>
    <!-- CONTRIBUTE: alive, ongoing -- a small dot actually travels the
         path on a loop, real SVG animation, not a static arrow. The label
         rides a separate, invisible path (contributeTextPath) that traces
         the same curve but always left-to-right, so it never renders
         upside down regardless of which way the visible arrow points. -->
    <path id="contributePathEl" d="${contributePath}" fill="none" stroke="url(#contributeGrad)" stroke-width="2.5" filter="url(#glow)" marker-end="url(#arrowContribute)"/>
    <path id="contributeTextPathEl" d="${contributeTextPath}" fill="none" stroke="none"/>
    <circle r="4" fill="#eafff8">
      <animateMotion dur="2.6s" repeatCount="indefinite" path="${contributePath}"/>
    </circle>
    <text font-size="13" font-weight="700" letter-spacing="0.04em" fill="#7fd8c4">
      <textPath href="#contributeTextPathEl" startOffset="${contributeTextOffset}">CONTRIBUTE</textPath>
    </text>
  `;
}
const heroFlow = document.getElementById('flow');
if (heroFlow) {
  window.addEventListener('resize', drawHeroConnectors);
  new ResizeObserver(drawHeroConnectors).observe(heroFlow);
  drawHeroConnectors();
}
