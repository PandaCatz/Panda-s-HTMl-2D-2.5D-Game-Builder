/* eslint-disable @typescript-eslint/no-this-alias, @typescript-eslint/no-unused-vars -- vendored standalone Path Editor runtime; preserve its tested ES5-compatible control flow. */
/*!
 * navpath.js — runtime for maps authored in the Path Editor (index.html).
 * Classic script: works over file://, in bundlers (CommonJS), and pasted inline
 * into a single-file HTML game. No dependencies.
 *
 *   <script src="navpath.js"></script>
 *   const map  = NavPath.loadMap(json);
 *   const res  = map.findPath({x: 12, y: 40}, {x: 80, y: 22});
 *   const walk = map.follow(res.points);
 *
 * COORDINATES: every x/y is a PERCENT of the map image (x: 0..100 of width,
 * y: 0..100 of height). That keeps data resolution-independent — the same map
 * works at any render size. Convert with map.toPixels(pt, w, h).
 *
 * DISTANCES: percent coordinates are anisotropic on a non-square image (1% of
 * width != 1% of height). All internal geometry runs in an aspect-corrected
 * metric space so path costs are true distances. Reported lengths are in
 * "percent of image height" — multiply by (renderedHeightPx / 100) for pixels.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NavPath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RUNTIME_VERSION = 1;

  /* ---------------------------------------------------------------- geometry */

  function pointInPoly(x, y, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  }

  // Proper (non-collinear) segment intersection. Grazing a shared endpoint or
  // running exactly along an edge reads as "no crossing" — fine for nav data,
  // where sub-pixel contact with a wall is not a real obstruction.
  function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
    return (
      ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
      ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
    );
  }

  function segCrossesPoly(ax, ay, bx, by, pts) {
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (segCross(ax, ay, bx, by, pts[j][0], pts[j][1], pts[i][0], pts[i][1])) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------- binary heap */

  function Heap() { this.a = []; }
  Heap.prototype.push = function (item, pri) {
    var a = this.a, i = a.length;
    a.push({ v: item, p: pri });
    while (i > 0) {
      var par = (i - 1) >> 1;
      if (a[par].p <= a[i].p) break;
      var t = a[par]; a[par] = a[i]; a[i] = t; i = par;
    }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, s = i;
        if (l < a.length && a[l].p < a[s].p) s = l;
        if (r < a.length && a[r].p < a[s].p) s = r;
        if (s === i) break;
        var t = a[s]; a[s] = a[i]; a[i] = t; i = s;
      }
    }
    return top.v;
  };
  Heap.prototype.size = function () { return this.a.length; };

  /* -------------------------------------------------------------------- map */

  function NavMap(data) {
    this.data = data;
    /** This map's destination id, e.g. "map-01-prospect-yards". */
    this.id = data.id || '';
    this.image = data.image || { w: 1000, h: 1000, name: '' };
    // x is % of width, y is % of height -> scale x by aspect to get a metric space
    this.kx = (this.image.w && this.image.h) ? this.image.w / this.image.h : 1;

    this.nodes = (data.nodes || []).map(function (n) {
      var o = { id: n.id, x: n.x, y: n.y, tags: n.tags || [], adj: [] };
      if (n.dest) o.dest = String(n.dest);
      return o;
    });
    this.byId = {};
    for (var i = 0; i < this.nodes.length; i++) this.byId[this.nodes[i].id] = i;

    this.walkable = [];
    this.blocked = [];
    var areas = data.areas || [];
    for (var a = 0; a < areas.length; a++) {
      (areas[a].kind === 'blocked' ? this.blocked : this.walkable).push(areas[a]);
    }

    // Locations are any named place on the map — a shop, a plaza, a park, a
    // dungeon mouth. `buildings` is the old key and still loads.
    this.locations = data.locations || data.buildings || [];
    this.characters = data.characters || [];
    this.locationsById = {};
    this.charactersById = {};
    for (var bi = 0; bi < this.locations.length; bi++) this.locationsById[this.locations[bi].id] = this.locations[bi];
    for (var ci = 0; ci < this.characters.length; ci++) this.charactersById[this.characters[ci].id] = this.characters[ci];

    // Aliases so existing code keeps working after the rename.
    this.buildings = this.locations;
    this.buildingsById = this.locationsById;

    // Destination ids: author-chosen names ("north_gate") that game code can
    // reference instead of generated node ids, which shift as a map is edited.
    this.destById = {};
    for (var di = 0; di < this.nodes.length; di++) {
      var dn = this.nodes[di];
      if (dn.dest) this.destById[String(dn.dest)] = { kind: 'node', id: String(dn.dest), index: di };
    }
    for (var db = 0; db < this.locations.length; db++) {
      var bd = this.locations[db];
      if (bd.dest) this.destById[String(bd.dest)] = { kind: 'building', id: String(bd.dest), ref: bd };
    }

    this.layers = data.layers || [];
    this.layersById = {};
    for (var li = 0; li < this.layers.length; li++) this.layersById[this.layers[li].id] = this.layers[li];

    this.edges = [];
    this.minCost = 1;
    var edges = data.edges || [];
    for (var e = 0; e < edges.length; e++) {
      var ed = edges[e];
      var ia = this.byId[ed.a], ib = this.byId[ed.b];
      if (ia === undefined || ib === undefined) continue; // drop dangling refs
      var mul = typeof ed.cost === 'number' && ed.cost > 0 ? ed.cost : 1;
      var len = this.dist(this.nodes[ia], this.nodes[ib]);
      var rec = { a: ia, b: ib, mul: mul, len: len, w: len * mul, oneWay: !!ed.oneWay,
                  layer: ed.layer === undefined ? '' : String(ed.layer) };
      this.edges.push(rec);
      this.nodes[ia].adj.push({ to: ib, w: rec.w, e: rec });
      if (!rec.oneWay) this.nodes[ib].adj.push({ to: ia, w: rec.w, e: rec });
      if (mul < this.minCost) this.minCost = mul;
    }
  }

  /**
   * Turn a list of layer ids into a lookup, or null for "no restriction".
   * An unlayered link belongs to the default layer '', so a map that never
   * used layers is unaffected by any of this.
   */
  NavMap.prototype.allowSet = function (layers) {
    if (!layers || !layers.length) return null;
    var set = {};
    for (var i = 0; i < layers.length; i++) set[String(layers[i])] = true;
    return set;
  };
  function edgeAllowed(rec, allow) { return !allow || allow[rec.layer] === true; }

  /** True distance between two percent-space points, in percent-of-height units. */
  NavMap.prototype.dist = function (p, q) {
    var dx = (p.x - q.x) * this.kx, dy = p.y - q.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  NavMap.prototype.toPixels = function (p, w, h) {
    return { x: (p.x / 100) * w, y: (p.y / 100) * h };
  };

  NavMap.prototype.fromPixels = function (p, w, h) {
    return { x: (p.x / w) * 100, y: (p.y / h) * 100 };
  };

  /** Inside a walkable area (if any are defined) and outside every blocked area. */
  NavMap.prototype.isWalkable = function (x, y) {
    for (var b = 0; b < this.blocked.length; b++) {
      if (pointInPoly(x, y, this.blocked[b].points)) return false;
    }
    if (!this.walkable.length) return true;
    for (var w = 0; w < this.walkable.length; w++) {
      if (pointInPoly(x, y, this.walkable[w].points)) return true;
    }
    return false;
  };

  /**
   * Can a character walk straight from a to b?
   * Conservative: a segment spanning two separate walkable polygons is rejected
   * even where they overlap, because the union is not tested as one shape.
   */
  NavMap.prototype.clearLine = function (a, b) {
    var i;
    for (i = 0; i < this.blocked.length; i++) {
      var bp = this.blocked[i].points;
      if (segCrossesPoly(a.x, a.y, b.x, b.y, bp)) return false;
      if (pointInPoly((a.x + b.x) / 2, (a.y + b.y) / 2, bp)) return false;
    }
    if (!this.walkable.length) return true;
    for (i = 0; i < this.walkable.length; i++) {
      var wp = this.walkable[i].points;
      if (
        pointInPoly(a.x, a.y, wp) &&
        pointInPoly(b.x, b.y, wp) &&
        !segCrossesPoly(a.x, a.y, b.x, b.y, wp)
      ) return true;
    }
    return false;
  };

  /** Nearest graph node to a point; with `allow`, only nodes on those layers. */
  NavMap.prototype.nearestNode = function (pt, allow) {
    var best = -1, bd = Infinity;
    for (var i = 0; i < this.nodes.length; i++) {
      if (allow) {
        var reachable = false, adj = this.nodes[i].adj;
        for (var k = 0; k < adj.length; k++) {
          if (edgeAllowed(adj[k].e, allow)) { reachable = true; break; }
        }
        if (!reachable) continue;
      }
      var d = this.dist(pt, this.nodes[i]);
      if (d < bd) { bd = d; best = i; }
    }
    return best < 0 ? null : { index: best, node: this.nodes[best], dist: bd };
  };

  /**
   * Closest point on the whole path network — projected onto an edge, not just
   * snapped to a node. Without this, a character standing mid-path walks
   * backwards to a node before setting off.
   */
  NavMap.prototype.nearestOnGraph = function (pt, mode, allow) {
    var forGoal = mode === 'goal';
    var best = null, bd = Infinity, i;
    for (i = 0; i < this.edges.length; i++) {
      var ed = this.edges[i];
      if (!edgeAllowed(ed, allow)) continue;
      var A = this.nodes[ed.a], B = this.nodes[ed.b];
      var vx = (B.x - A.x) * this.kx, vy = B.y - A.y;
      var L2 = vx * vx + vy * vy;
      var t = L2 ? (((pt.x - A.x) * this.kx) * vx + (pt.y - A.y) * vy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var px = A.x + (B.x - A.x) * t, py = A.y + (B.y - A.y) * t;
      var d = this.dist(pt, { x: px, y: py });
      if (d < bd) { bd = d; best = { point: { x: px, y: py }, edge: ed, t: t, dist: d }; }
    }
    var nn = this.nearestNode(pt, allow);
    if (!best) {
      return nn ? { point: { x: nn.node.x, y: nn.node.y }, edge: null, dist: nn.dist,
                    entries: [{ index: nn.index, cost: nn.dist }] } : null;
    }
    var A2 = this.nodes[best.edge.a], B2 = this.nodes[best.edge.b];
    var EPS = 1e-9;
    var entries = [];
    // On a one-way edge a->b, a point strictly inside the segment can only be
    // left by running forward to b (start) or reached by running forward from a
    // (goal) -- but a point sitting exactly ON an endpoint is that node, and a
    // node is always a legal place to stand.
    var allowA = !best.edge.oneWay || forGoal || best.t <= EPS;
    var allowB = !best.edge.oneWay || !forGoal || best.t >= 1 - EPS;
    if (allowA) entries.push({ index: best.edge.a, cost: best.dist + this.dist(best.point, A2) * best.edge.mul });
    if (allowB) entries.push({ index: best.edge.b, cost: best.dist + this.dist(best.point, B2) * best.edge.mul });
    if (nn && (nn.dist < best.dist || !entries.length)) entries.push({ index: nn.index, cost: nn.dist });
    best.entries = entries;
    return best;
  };

  /**
   * A* across the path graph.
   * opts.smooth  – string-pull the result against the areas (default true)
   * opts.direct  – return a straight line when one is clearly walkable (default true)
   * opts.snap    – join the network at the nearest point on the nearest EDGE
   *                (default true). false restricts entry/exit to graph nodes.
   * Returns { ok, points:[{x,y}], length, cost, nodes:[id],
   *           startWalkable, endWalkable }.
   *
   * length is raw geometry; cost is the weighted total the search minimised
   * (edge length x its cost multiplier). They differ wherever costs are set.
   *
   * startWalkable/endWalkable are false when that endpoint sits in a blocked
   * area or outside every walkable one. The path is still returned, but its
   * first or last leg necessarily clips through illegal ground -- snap the
   * character out with nearestOnGraph(pt).point before moving.
   */
  NavMap.prototype.findPath = function (from, to, opts) {
    opts = opts || {};
    var smooth = opts.smooth !== false;
    var direct = opts.direct !== false;
    var snap = opts.snap !== false;
    var okStart = this.isWalkable(from.x, from.y);
    var okEnd = this.isWalkable(to.x, to.y);

    function fail() {
      return { ok: false, points: [], length: 0, cost: Infinity, nodes: [],
               startWalkable: okStart, endWalkable: okEnd };
    }

    if (direct && (this.walkable.length || this.blocked.length) && this.clearLine(from, to)) {
      var d = this.dist(from, to);
      return { ok: true, points: [copy(from), copy(to)], length: d, cost: d, nodes: [],
               startWalkable: okStart, endWalkable: okEnd };
    }
    if (!this.nodes.length) return fail();

    var allow = this.allowSet(opts.layers);
    var start = snap ? this.nearestOnGraph(from, 'start', allow) : this.nodeEntry(from, allow);
    var goal = snap ? this.nearestOnGraph(to, 'goal', allow) : this.nodeEntry(to, allow);
    if (!start || !goal) return fail();

    var exitCost = {};
    for (var g = 0; g < goal.entries.length; g++) exitCost[goal.entries[g].index] = goal.entries[g].cost;

    var self = this;
    var N = this.nodes.length;
    var gScore = new Float64Array(N); gScore.fill(Infinity);
    var cameFrom = new Int32Array(N); cameFrom.fill(-1);
    var closed = new Uint8Array(N);
    var open = new Heap();

    // h is admissible: every edge costs at least its length x the cheapest multiplier.
    function h(i) { return self.dist(self.nodes[i], to) * self.minCost; }

    for (var s = 0; s < start.entries.length; s++) {
      var en = start.entries[s];
      if (en.cost < gScore[en.index]) {
        gScore[en.index] = en.cost;
        open.push(en.index, en.cost + h(en.index));
      }
    }

    var bestGoalNode = -1, bestTotal = Infinity;
    while (open.size()) {
      var cur = open.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;

      if (exitCost[cur] !== undefined) {
        var total = gScore[cur] + exitCost[cur];
        if (total < bestTotal) { bestTotal = total; bestGoalNode = cur; }
      }
      // Nothing still open can beat the best exit found so far.
      if (gScore[cur] + h(cur) >= bestTotal) break;

      var adj = this.nodes[cur].adj;
      for (var k = 0; k < adj.length; k++) {
        var nb = adj[k];
        if (!edgeAllowed(nb.e, allow)) continue;
        if (closed[nb.to]) continue;
        var tentative = gScore[cur] + nb.w;
        if (tentative < gScore[nb.to]) {
          gScore[nb.to] = tentative;
          cameFrom[nb.to] = cur;
          open.push(nb.to, tentative + h(nb.to));
        }
      }
    }

    if (bestGoalNode < 0) return fail();

    var chain = [];
    for (var c = bestGoalNode; c !== -1; c = cameFrom[c]) chain.push(c);
    chain.reverse();

    var pts = [copy(from)];
    if (start.edge && start.t > 0 && start.t < 1) pts.push(copy(start.point));
    for (var i = 0; i < chain.length; i++) pts.push({ x: this.nodes[chain[i]].x, y: this.nodes[chain[i]].y });
    if (goal.edge && goal.t > 0 && goal.t < 1) pts.push(copy(goal.point));
    pts.push(copy(to));

    pts = dedupe(pts);
    if (smooth && (this.walkable.length || this.blocked.length)) pts = this.smoothPath(pts);

    return {
      ok: true,
      points: pts,
      length: this.pathLength(pts),
      cost: bestTotal,
      nodes: chain.map(function (i2) { return self.nodes[i2].id; }),
      startWalkable: okStart,
      endWalkable: okEnd
    };
  };

  /** Entry/exit restricted to graph nodes — the shape nearestOnGraph returns. */
  NavMap.prototype.nodeEntry = function (pt, allow) {
    var nn = this.nearestNode(pt, allow);
    if (!nn) return null;
    return {
      point: { x: nn.node.x, y: nn.node.y }, edge: null, t: 0, dist: nn.dist,
      entries: [{ index: nn.index, cost: nn.dist }]
    };
  };

  /** String-pull: drop any waypoint its neighbours can see past. */
  NavMap.prototype.smoothPath = function (pts) {
    if (pts.length < 3) return pts;
    var out = [pts[0]];
    var anchor = 0;
    for (var i = 1; i < pts.length - 1; i++) {
      if (!this.clearLine(pts[anchor], pts[i + 1])) {
        out.push(pts[i]);
        anchor = i;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };

  NavMap.prototype.pathLength = function (pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += this.dist(pts[i - 1], pts[i]);
    return L;
  };

  /**
   * Turn a path into something a character can walk.
   *   var w = map.follow(res.points);
   *   var p = w.at(distanceTravelled);   // {x, y, angle, done}
   * Distances are percent-of-image-height; multiply by renderedH/100 for pixels.
   */
  NavMap.prototype.follow = function (pts) {
    var segs = [], total = 0;
    for (var i = 1; i < pts.length; i++) {
      var d = this.dist(pts[i - 1], pts[i]);
      if (d <= 0) continue;
      segs.push({ a: pts[i - 1], b: pts[i], d: d, start: total });
      total += d;
    }
    return {
      length: total,
      points: pts,
      at: function (dist) {
        if (!segs.length) return { x: pts[0] ? pts[0].x : 0, y: pts[0] ? pts[0].y : 0, angle: 0, done: true };
        if (dist <= 0) {
          var f = segs[0];
          return { x: f.a.x, y: f.a.y, angle: Math.atan2(f.b.y - f.a.y, f.b.x - f.a.x), done: false };
        }
        if (dist >= total) {
          var l = segs[segs.length - 1];
          return { x: l.b.x, y: l.b.y, angle: Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x), done: true };
        }
        var lo = 0, hi = segs.length - 1;
        while (lo < hi) {
          var mid = (lo + hi + 1) >> 1;
          if (segs[mid].start <= dist) lo = mid; else hi = mid - 1;
        }
        var s = segs[lo], t = (dist - s.start) / s.d;
        return {
          x: s.a.x + (s.b.x - s.a.x) * t,
          y: s.a.y + (s.b.y - s.a.y) * t,
          angle: Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x),
          done: false
        };
      }
    };
  };

  /* ------------------------------------------------- buildings & characters */

  NavMap.prototype.location = function (id) { return this.locationsById[id] || null; };
  NavMap.prototype.character = function (id) { return this.charactersById[id] || null; };

  /** Building whose footprint contains this point — for click-to-enter. */
  NavMap.prototype.locationAt = function (x, y) {
    for (var i = this.locations.length - 1; i >= 0; i--) {
      var b = this.locations[i];
      if (b.footprint && b.footprint.length >= 3 && pointInPoly(x, y, b.footprint)) return b;
    }
    return null;
  };

  /**
   * Walk to a building. A building with a pinned `node` is entered through
   * that node — the last leg runs from the door to the anchor, which is how a
   * doorway on the edge of a footprint is meant to work. Without a pin the
   * anchor is pathed to directly and snapping picks the nearest way in.
   */
  NavMap.prototype.pathToLocation = function (from, ref, opts) {
    var b = typeof ref === 'string' ? this.location(ref) : ref;
    if (!b) {
      return { ok: false, points: [], length: 0, cost: Infinity, nodes: [],
               startWalkable: this.isWalkable(from.x, from.y), endWalkable: false, building: null };
    }
    var pinned = b.node !== undefined && this.byId[b.node] !== undefined
      ? this.nodes[this.byId[b.node]] : null;
    var res = this.findPath(from, pinned ? { x: pinned.x, y: pinned.y } : { x: b.x, y: b.y }, opts);
    if (res.ok && pinned) {
      var last = res.points[res.points.length - 1];
      if (Math.abs(last.x - b.x) > 1e-6 || Math.abs(last.y - b.y) > 1e-6) {
        res.points.push({ x: b.x, y: b.y });
        res.length = this.pathLength(res.points);
      }
    }
    res.building = b;
    return res;
  };

  /**
   * Stitch a character's patrol route into one continuous path, pathfinding
   * between consecutive stops. opts.loop closes it back to the start.
   * Returns { ok, points, length, legs, missing } — `missing` names route
   * entries that are not nodes on this map.
   */
  NavMap.prototype.routeFor = function (ref, opts) {
    opts = opts || {};
    var c = typeof ref === 'string' ? this.character(ref) : ref;
    var out = { ok: false, points: [], length: 0, legs: 0, missing: [] };
    if (!c) return out;

    var stops = [], missing = [];
    var useGlobal = (c.ai && c.ai.routeMode === 'global') || opts.global === true;
    var route = useGlobal ? (this.data.globalRoute || []) : (c.route || []);
    for (var i = 0; i < route.length; i++) {
      // Stops may be waypoint ids, node ids or buildings.
      var d = this.destination(route[i]);
      if (!d) missing.push(route[i]);
      else stops.push(d.point);
    }
    out.missing = missing;
    if (opts.loop && stops.length) stops.push({ x: c.x, y: c.y });
    if (!stops.length) {
      out.ok = true; out.points = [{ x: c.x, y: c.y }];
      return out;
    }

    var pts = [{ x: c.x, y: c.y }], cur = { x: c.x, y: c.y };
    for (var s = 0; s < stops.length; s++) {
      var leg = this.findPath(cur, stops[s], opts);
      if (!leg.ok) { out.points = pts; out.length = this.pathLength(pts); return out; }
      for (var k = 1; k < leg.points.length; k++) pts.push(leg.points[k]);
      cur = stops[s];
      out.legs++;
    }
    out.ok = true;
    out.points = dedupe(pts);
    out.length = this.pathLength(out.points);
    return out;
  };

  /* ------------------------------------------------------ destinations --- */

  /**
   * Resolve anything a designer or a script might name a place by, in order:
   * a node's destination id, a raw node id, a building id, a building name.
   * Returns { kind, id, point, ref } or null.
   *
   *   map.findPathTo(hero, 'north_gate')
   *   agent.goToDestination('Trading Post')
   */
  NavMap.prototype.destination = function (ref) {
    if (ref === null || ref === undefined) return null;
    if (typeof ref === 'object') {
      if (ref.id !== undefined && this.buildingsById[ref.id]) ref = ref.id;
      else if (typeof ref.x === 'number' && typeof ref.y === 'number') {
        return { kind: 'point', id: null, point: { x: ref.x, y: ref.y }, ref: ref };
      } else return null;
    }
    var id = String(ref);

    var d = this.destById[id];
    if (d) {
      if (d.kind === 'building') return { kind: 'building', id: id, point: { x: d.ref.x, y: d.ref.y }, ref: d.ref };
      var dn = this.nodes[d.index];
      return { kind: 'node', id: id, point: { x: dn.x, y: dn.y }, ref: dn };
    }
    if (this.byId[id] !== undefined) {
      var n = this.nodes[this.byId[id]];
      return { kind: 'node', id: id, point: { x: n.x, y: n.y }, ref: n };
    }
    var b = this.buildingsById[id];
    if (b) return { kind: 'building', id: id, point: { x: b.x, y: b.y }, ref: b };

    var lower = id.toLowerCase();
    for (var i = 0; i < this.locations.length; i++) {
      if (String(this.locations[i].name || '').toLowerCase() === lower) {
        var hit = this.locations[i];
        return { kind: 'building', id: hit.id, point: { x: hit.x, y: hit.y }, ref: hit };
      }
    }
    return null;
  };

  /** Every named place on the map — what a "travel to…" menu is built from. */
  NavMap.prototype.destinations = function () {
    var out = [], i;
    for (i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].dest) {
        out.push({ kind: 'node', id: String(this.nodes[i].dest), node: this.nodes[i].id,
                   x: this.nodes[i].x, y: this.nodes[i].y });
      }
    }
    for (i = 0; i < this.locations.length; i++) {
      out.push({ kind: 'building', id: this.locations[i].id, name: this.locations[i].name,
                 x: this.locations[i].x, y: this.locations[i].y });
    }
    return out;
  };

  /** findPath, but to a named place. Buildings enter through their door node. */
  NavMap.prototype.findPathTo = function (from, ref, opts) {
    var d = this.destination(ref);
    if (!d) {
      return { ok: false, points: [], length: 0, cost: Infinity, nodes: [],
               startWalkable: this.isWalkable(from.x, from.y), endWalkable: false,
               destination: null, reason: 'unknown destination' };
    }
    var res = d.kind === 'building'
      ? this.pathToLocation(from, d.ref, opts)
      : this.findPath(from, d.point, opts);
    res.destination = d;
    return res;
  };

  /* -------------------------------------------------- travel between maps */

  /**
   * Every link from this map to another one — buildings whose interaction is
   * `{ type: 'travel', map: 'map-02-…' }`. Each entry carries the arrival
   * waypoint, if one was named.
   */
  NavMap.prototype.travelLinks = function () {
    var out = [];
    for (var i = 0; i < this.locations.length; i++) {
      var b = this.locations[i], it = b.interact;
      if (it && it.type === 'travel' && it.map) {
        out.push({ from: this.id, to: String(it.map), via: b.id,
                   name: b.name || b.id, arriveAt: it.node ? String(it.node) : null });
      }
    }
    return out;
  };

  /** Where a player lands on arrival — the named waypoint, else the first node. */
  NavMap.prototype.arrival = function (waypoint) {
    if (waypoint) {
      var d = this.destination(waypoint);
      if (d) return d.point;
    }
    var spawn = null;
    for (var i = 0; i < this.nodes.length; i++) {
      var t = this.nodes[i].tags;
      if (t && t.indexOf('spawn') !== -1) { spawn = this.nodes[i]; break; }
    }
    var n = spawn || this.nodes[0];
    return n ? { x: n.x, y: n.y } : null;
  };

  /**
   * Validate a whole set of maps at once: which travel links point at a map id
   * that is not in the set, and which arrival waypoints do not exist there.
   * Call it once at build time over every map file the game ships.
   */
  function checkTravel(maps) {
    var byId = {}, i, j;
    for (i = 0; i < maps.length; i++) {
      var m = maps[i].loadMap ? maps[i] : loadMap(maps[i]);
      maps[i] = m;
      if (m.id) byId[m.id] = m;
    }
    var problems = [];
    for (i = 0; i < maps.length; i++) {
      if (!maps[i].id) problems.push({ kind: 'no-map-id', map: maps[i].image.name || '(unnamed)' });
      var links = maps[i].travelLinks();
      for (j = 0; j < links.length; j++) {
        var target = byId[links[j].to];
        if (!target) { problems.push({ kind: 'unknown-map', link: links[j] }); continue; }
        if (links[j].arriveAt && !target.destination(links[j].arriveAt)) {
          problems.push({ kind: 'unknown-arrival', link: links[j] });
        }
      }
    }
    return problems;
  }

  /* ----------------------------------------------------- interactions ---- */

  /**
   * The location the player can interact with at this point.
   *
   * A location's clickable region is its polygon hotspot when it has one —
   * exact, in percent coordinates, and entirely independent of the background
   * image. A bare anchor with no polygon falls back to a proximity radius so
   * a single point is still usable; an explicit interact.radius adds proximity
   * on top of a polygon, for "walk near the inn" triggers.
   */
  NavMap.prototype.interactableAt = function (x, y, radius) {
    var pt = { x: x, y: y };
    // Being inside a drawn hotspot always beats merely being near something
    // else's anchor. Ranking every candidate by anchor distance regardless of
    // how it qualified let a nearby point steal a click from the polygon the
    // click was actually inside.
    var inside = this.hotspotAt(x, y);
    if (inside) return inside;

    var best = null, bd = Infinity;
    for (var i = 0; i < this.locations.length; i++) {
      var b = this.locations[i];
      if (!b.interact || b.interact.type === 'none') continue;
      var poly = b.footprint && b.footprint.length >= 3 ? b.footprint : null;
      // Proximity applies where it was asked for, or where there is no polygon
      // to be inside of.
      var explicit = typeof b.interact.radius === 'number';
      if (poly && !explicit) continue;
      var r = explicit ? b.interact.radius : typeof radius === 'number' ? radius : 6;
      var d = this.dist(pt, b);
      if (d > r) continue;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };

  /** Only polygon hotspots — the clickable regions, ignoring proximity. */
  NavMap.prototype.hotspotAt = function (x, y) {
    for (var i = this.locations.length - 1; i >= 0; i--) {
      var b = this.locations[i];
      if (!b.interact || b.interact.type === 'none') continue;
      if (b.footprint && b.footprint.length >= 3 && pointInPoly(x, y, b.footprint)) return b;
    }
    return null;
  };

  /** Every clickable polygon hotspot, for building a hit map or debug overlay. */
  NavMap.prototype.hotspots = function () {
    var out = [];
    for (var i = 0; i < this.locations.length; i++) {
      var b = this.locations[i];
      if (b.interact && b.interact.type !== 'none' && b.footprint && b.footprint.length >= 3) {
        out.push({ id: b.id, dest: b.dest || null, name: b.name,
                   type: b.interact.type, points: b.footprint, location: b });
      }
    }
    return out;
  };

  /** Every link that crosses a blocked area — a data bug, not a runtime one. */
  NavMap.prototype.blockedEdges = function () {
    var out = [];
    for (var i = 0; i < this.edges.length; i++) {
      var e = this.edges[i], A = this.nodes[e.a], B = this.nodes[e.b];
      for (var k = 0; k < this.blocked.length; k++) {
        var p = this.blocked[k].points;
        if (segCrossesPoly(A.x, A.y, B.x, B.y, p) ||
            pointInPoly((A.x + B.x) / 2, (A.y + B.y) / 2, p)) {
          out.push({ a: A.id, b: B.id, area: this.blocked[k].id });
          break;
        }
      }
    }
    return out;
  };

  /* ----------------------------------------------- embedding into a game -- */

/*
   * A map lives inside a game's HTML between two marker comments, as a plain
   * JSON <script> plus the runtime. Keeping the data in its own
   * type="application/json" block (rather than as a JS literal) means pulling
   * it back out is a parse, not an eval — which is what makes the editor able
   * to reopen a game, edit its map, and write it back.
   */
  /*
   * The marker strings are BUILT, never written as literals.
   *
   * When the runtime is embedded inside the block it guards, any literal marker
   * in this file's source would end up inside that block — and the next save
   * would find the copy instead of the real marker and splice the file apart.
   * Concatenating keeps the exact marker text out of this source entirely, and
   * a test asserts that invariant so it cannot quietly come back.
   */
  var TAG = 'nav' + 'path';
  var MARK_BEGIN = '<!-- ' + TAG + ':begin - generated by the path editor, do not hand-edit -->';
  var MARK_END = '<!-- ' + TAG + ':end -->';
  var DATA_ID = TAG + '-map';
  var RE_BEGIN = new RegExp('<!--\\s*' + TAG + ':begin[\\s\\S]*?-->', 'gi');
  var RE_END = new RegExp('<!--\\s*' + TAG + ':end\\s*-->', 'gi');
  var RE_DATA = new RegExp(
    '<script[^>]*\\bid\\s*=\\s*["\']' + DATA_ID + '["\'][^>]*>([\\s\\S]*?)<\\/script\\s*>', 'i');

  /** First match of a global regex, or null. */
  function firstMatch(re, s) {
    re.lastIndex = 0;
    var m = re.exec(s);
    return m ? { index: m.index, length: m[0].length } : null;
  }
  /** Last match of a global regex, or null — the real end of a nested block. */
  function lastMatch(re, s) {
    re.lastIndex = 0;
    var m, hit = null;
    while ((m = re.exec(s)) !== null) {
      hit = { index: m.index, length: m[0].length };
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return hit;
  }

  /** Pull an embedded map back out of a game's HTML. Null if there is none. */
  function extractMap(html) {
    if (typeof html !== 'string') return null;
    var m = RE_DATA.exec(html);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  }

  /**
   * Write a map into a game's HTML, replacing any block already there.
   *
   * opts.runtime  – navpath.js source to embed alongside the data. Omit if the
   *                 game already loads the runtime some other way.
   * opts.varName  – global the loaded NavMap is assigned to (default GAME_MAP).
   *
   * Returns the new HTML. Never mutates the input.
   */
  function injectMap(html, data, opts) {
    opts = opts || {};
    var varName = opts.varName || 'GAME_MAP';
    // A closing tag inside the JSON would end the script element early; the
    // escape keeps it valid JSON while making that impossible.
    var json = JSON.stringify(data).replace(/</g, '\\u003c');

    var parts = [
      MARK_BEGIN,
      '<script type="application/json" id="' + DATA_ID + '">' + json + '</scr' + 'ipt>'
    ];
    if (opts.runtime) parts.push('<script>' + opts.runtime + '\n</scr' + 'ipt>');
    parts.push(
      '<script>window.' + varName + ' = NavPath.loadMap(JSON.parse(' +
      'document.getElementById("' + DATA_ID + '").textContent));</scr' + 'ipt>'
    );
    parts.push(MARK_END);
    var block = parts.join('\n');

    html = typeof html === 'string' ? html : '';
    // Outermost pair: the real block wraps everything it embedded, so the first
    // begin and the last end are its own even if something inside looks alike.
    var b = firstMatch(RE_BEGIN, html);
    var e = lastMatch(RE_END, html);
    if (b && e && e.index > b.index) {
      return html.slice(0, b.index) + block + html.slice(e.index + e.length);
    }
    // No block yet: go in just before </body> so the game's own scripts, and
    // the DOM they expect, already exist by the time this runs.
    var close = html.toLowerCase().lastIndexOf('</body>');
    if (close !== -1) return html.slice(0, close) + block + '\n' + html.slice(close);
    return html + (html && html.slice(-1) !== '\n' ? '\n' : '') + block + '\n';
  }

  /** True if this HTML already carries an embedded map. */
  function hasMap(html) { return extractMap(html) !== null; }

  /* ------------------------------------------------------------ sprites --- */

  /**
   * Which animation frame is showing at `seconds`. The map records a folder
   * and file names — your game loads the images; this is just the timing.
   *
   *   var i = NavPath.frameAt(ch.sprite, elapsed);
   *   ctx.drawImage(sheet[i], ...);
   *
   * fps of 0 (or one frame) holds on the first frame. Pass loop:false to stop
   * on the last frame instead of cycling.
   */
  function frameAt(sprite, seconds, opts) {
    if (!sprite || !sprite.frames || !sprite.frames.length) return 0;
    var n = sprite.frames.length;
    var fps = typeof sprite.fps === 'number' && sprite.fps > 0 ? sprite.fps : 0;
    if (!fps || n === 1) return 0;
    if (!(seconds > 0)) return 0;
    var i = Math.floor(seconds * fps);
    if (opts && opts.loop === false) return i >= n ? n - 1 : i;
    return i % n;
  }

  /** Resolve a frame's path: assetBase + folder + name. */
  function framePath(sprite, index, assetBase) {
    if (!sprite || !sprite.frames || !sprite.frames.length) return '';
    var name = sprite.frames[((index % sprite.frames.length) + sprite.frames.length) % sprite.frames.length];
    var parts = [];
    if (assetBase) parts.push(String(assetBase).replace(/\/+$/, ''));
    if (sprite.folder) parts.push(String(sprite.folder).replace(/^\/+|\/+$/g, ''));
    parts.push(name);
    return parts.join('/');
  }

  /* ------------------------------------------------------------- agents --- */

  function hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  // mulberry32 — seeded so a character's wandering replays identically.
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * A scripted walker. Not intelligence — a four-state machine that picks a
   * goal, paths to it, walks the path, waits, and picks again. It only ever
   * moves along paths findPath returns, so it cannot enter a blocked area
   * unless a link you authored crosses one (see blockedEdges()).
   *
   *   var a = map.agent(map.character('c0'));
   *   a.update(dt);            // each frame; dt in seconds
   *   draw(a.x, a.y, a.angle); // percent coords, same as everything else
   */
  function Agent(map, ch, opts) {
    opts = opts || {};
    var ai = ch.ai || {};
    this.map = map;
    this.character = ch;
    this.behavior = ai.behavior || 'idle';
    this.speed = typeof ai.speed === 'number' ? ai.speed : 20;
    this.pauseFor = typeof ai.pause === 'number' ? ai.pause : 1;
    this.loop = ai.loop !== false;
    this.targets = ai.targets || [];
    /** Path layers this character may use. Empty = the whole network. */
    this.layers = ai.layers && ai.layers.length ? ai.layers.slice() : null;
    /** 'custom' walks the character's own stops, 'global' the map's shared route. */
    this.routeMode = ai.routeMode === 'global' ? 'global' : 'custom';
    this.walkOpts = this.layers ? { layers: this.layers } : undefined;

    this.x = ch.x; this.y = ch.y;
    this.angle = ((ch.facing || 0) * Math.PI) / 180;
    this.state = 'idle';
    this.target = null;
    this.path = null;

    this.rng = makeRng(opts.seed === undefined ? hashString(String(ch.id)) : opts.seed);
    this.walker = null;
    this.travelled = 0;
    this.wait = 0;
    this.stop = 0;
    this.fails = 0;

    // Goals are drawn from the network the character can actually reach, so a
    // walker never sets off toward an island it can never arrive at.
    this.reach = null;
    var near = map.nearestNode({ x: ch.x, y: ch.y }, map.allowSet(this.layers));
    if (near) {
      var groups = map.components(this.layers);
      for (var g = 0; g < groups.length; g++) {
        if (groups[g].indexOf(near.node.id) !== -1) { this.reach = groups[g]; break; }
      }
    }
  }

  /** The stop list this agent walks: its own, or the map's shared route. */
  Agent.prototype.stops = function () {
    if (this.routeMode === 'global') return (this.map.data.globalRoute || []).slice();
    return (this.character.route || []).slice();
  };

  Agent.prototype._reachableLocations = function () {
    var list = [], self = this;
    var pool = this.targets.length
      ? this.targets.map(function (id) { return self.map.location(id); }).filter(Boolean)
      : this.map.buildings;
    for (var i = 0; i < pool.length; i++) {
      var b = pool[i];
      var door = b.node && this.map.byId[b.node] !== undefined
        ? b.node
        : (this.map.nearestNode(b) || {}).node;
      var id = typeof door === 'string' ? door : door && door.id;
      if (!this.reach || (id && this.reach.indexOf(id) !== -1)) list.push(b);
    }
    return list;
  };

  Agent.prototype._pickGoal = function () {
    var ch = this.character;
    if (this.behavior === 'patrol') {
      var route = this.stops();
      if (!route.length) return null;
      if (this.stop >= route.length) {
        if (!this.loop) return null;
        this.stop = 0;
      }
      // Stops resolve through destination(), so a route may name waypoint ids
      // or buildings, not only raw node ids.
      var tries = 0;
      while (tries++ < route.length) {
        var d = this.map.destination(route[this.stop++]);
        if (this.stop >= route.length && this.loop) this.stop = 0;
        if (d) return { kind: d.kind, id: d.id, point: d.point, ref: d.ref };
        if (this.stop >= route.length) break;
      }
      return null;
    }
    if (this.behavior === 'visit') {
      var bs = this._reachableLocations();
      if (!bs.length) return null;
      var b = bs[Math.floor(this.rng() * bs.length)];
      return { kind: 'building', id: b.id, point: { x: b.x, y: b.y }, ref: b };
    }
    if (this.behavior === 'wander') {
      var pool = this.reach && this.reach.length ? this.reach : this.map.nodes.map(function (n) { return n.id; });
      if (!pool.length) return null;
      var nid = pool[Math.floor(this.rng() * pool.length)];
      var ni = this.map.byId[nid];
      if (ni === undefined) return null;
      return { kind: 'node', id: nid, point: { x: this.map.nodes[ni].x, y: this.map.nodes[ni].y } };
    }
    return null;
  };

  Agent.prototype._depart = function () {
    var goal = this._pickGoal();
    if (!goal) { this.state = 'idle'; return false; }

    var here = { x: this.x, y: this.y };
    var res = goal.kind === 'building'
      ? this.map.pathToLocation(here, goal.ref || goal.id, this.walkOpts)
      : this.map.findPath(here, goal.point, this.walkOpts);

    if (!res.ok || res.points.length < 2) {
      // Unreachable right now — count it, and stand down rather than spin.
      if (++this.fails >= 8) { this.state = 'idle'; this.fails = 0; return false; }
      this.state = 'waiting';
      this.wait = 0.5;
      return false;
    }
    this.fails = 0;
    this.target = goal;
    this.path = res;
    this.walker = this.map.follow(res.points);
    this.travelled = 0;
    this.state = 'walking';
    return true;
  };

  Agent.prototype.update = function (dt) {
    if (!(dt > 0)) dt = 0;

    if (this.state === 'idle') {
      if (this.behavior !== 'idle') this._depart();
      return this;
    }
    if (this.state === 'waiting') {
      this.wait -= dt;
      if (this.wait <= 0) this._depart();
      return this;
    }
    if (this.state === 'walking' && this.walker) {
      this.travelled += this.speed * dt;
      var p = this.walker.at(this.travelled);
      this.x = p.x; this.y = p.y; this.angle = p.angle;
      if (p.done) {
        this.state = 'waiting';
        this.wait = this.pauseFor;
        this.walker = null;
      }
    }
    return this;
  };

  /** Send an agent somewhere specific — a player click, a scripted cue. */
  Agent.prototype.goTo = function (pt, opts) {
    var res = this.map.findPath({ x: this.x, y: this.y }, pt, opts || this.walkOpts);
    if (!res.ok || res.points.length < 2) return false;
    this.target = { kind: 'point', point: { x: pt.x, y: pt.y } };
    this.path = res;
    this.walker = this.map.follow(res.points);
    this.travelled = 0;
    this.state = 'walking';
    return true;
  };

  Agent.prototype.stopWalking = function () {
    this.state = 'idle'; this.walker = null; this.path = null; this.target = null;
    return this;
  };

  NavMap.prototype.agent = function (ref, opts) {
    var c = typeof ref === 'string' ? this.character(ref) : ref;
    return c ? new Agent(this, c, opts) : null;
  };

  /** One agent per character on the map, ready to update() each frame. */
  NavMap.prototype.agents = function (opts) {
    var self = this;
    return this.characters.map(function (c) { return new Agent(self, c, opts); });
  };

  // Legacy names kept working after buildings were generalised to locations.
  NavMap.prototype.building = NavMap.prototype.location;
  NavMap.prototype.buildingAt = NavMap.prototype.locationAt;
  NavMap.prototype.pathToBuilding = NavMap.prototype.pathToLocation;

  /**
   * Strongly connected components — groups of nodes that can all reach each
   * other *following link direction*.
   *
   * components() below is undirected, so it happily calls a graph "connected"
   * when one-way links have made half of it a dead end you can walk into but
   * never out of. This is the check that catches that.
   *
   * Iterative Tarjan: a recursive one blows the stack on a long corridor of
   * nodes, which is exactly the shape a hand-drawn path graph tends to have.
   */
  NavMap.prototype.strongComponents = function (layers) {
    var allow = this.allowSet(layers);
    var n = this.nodes.length;
    var index = new Int32Array(n).fill(-1);
    var low = new Int32Array(n);
    var onStack = new Uint8Array(n);
    var stack = [], comps = [], counter = 0;

    for (var s = 0; s < n; s++) {
      if (index[s] !== -1) continue;
      var work = [{ v: s, pi: 0 }];
      while (work.length) {
        var frame = work[work.length - 1];
        var v = frame.v;
        if (frame.pi === 0) {
          index[v] = low[v] = counter++;
          stack.push(v); onStack[v] = 1;
        }
        var descended = false;
        var adj = this.nodes[v].adj;    // already directional: one-way pushes once
        while (frame.pi < adj.length) {
          var nb = adj[frame.pi++];
          if (!edgeAllowed(nb.e, allow)) continue;
          var w = nb.to;
          if (index[w] === -1) { work.push({ v: w, pi: 0 }); descended = true; break; }
          if (onStack[w] && index[w] < low[v]) low[v] = index[w];
        }
        if (descended) continue;

        if (low[v] === index[v]) {
          var comp = [];
          for (;;) {
            var t = stack.pop(); onStack[t] = 0;
            comp.push(this.nodes[t].id);
            if (t === v) break;
          }
          comps.push(comp);
        }
        work.pop();
        if (work.length) {
          var parent = work[work.length - 1].v;
          if (low[v] < low[parent]) low[parent] = low[v];
        }
      }
    }
    return comps;
  };

  /**
   * Which named places cannot be walked to from which others, honouring link
   * direction. Run it before shipping a map: an NPC sent somewhere it can
   * never arrive just stands still, with nothing in the console to explain it.
   *
   * Returns { places, pairs, oneWaySplit, strong } — `pairs` is [{from, to}]
   * capped by opts.limit (default 50), `oneWaySplit` is true when direction
   * alone broke the graph into pieces.
   */
  NavMap.prototype.unreachablePlaces = function (opts) {
    opts = opts || {};
    var limit = opts.limit === undefined ? 50 : opts.limit;
    var strong = this.strongComponents(opts.layers);
    var compOf = {};
    for (var c = 0; c < strong.length; c++) {
      for (var k = 0; k < strong[c].length; k++) compOf[strong[c][k]] = c;
    }

    // Condensation graph, then reachability between components.
    var C = strong.length;
    var cadj = [];
    for (var i = 0; i < C; i++) cadj.push([]);
    var allow = this.allowSet(opts.layers);
    for (var e = 0; e < this.edges.length; e++) {
      var ed = this.edges[e];
      if (!edgeAllowed(ed, allow)) continue;
      var ca = compOf[this.nodes[ed.a].id], cb = compOf[this.nodes[ed.b].id];
      if (ca !== cb) cadj[ca].push(cb);
      if (!ed.oneWay && cb !== ca) cadj[cb].push(ca);
    }
    var reach = [];
    for (var r = 0; r < C; r++) {
      var seen = {}, st = [r];
      seen[r] = true;
      while (st.length) {
        var cur = st.pop();
        var outs = cadj[cur];
        for (var o = 0; o < outs.length; o++) {
          if (!seen[outs[o]]) { seen[outs[o]] = true; st.push(outs[o]); }
        }
      }
      reach.push(seen);
    }

    // "Places" are what a designer named: locations, and nodes with a dest id.
    var places = [], p;
    for (p = 0; p < this.locations.length; p++) {
      var b = this.locations[p];
      var door = b.node !== undefined && this.byId[b.node] !== undefined
        ? this.nodes[this.byId[b.node]]
        : (this.nearestNode(b) || {}).node;
      if (door) places.push({ label: b.dest || b.name || b.id, node: door.id });
    }
    for (p = 0; p < this.nodes.length; p++) {
      if (this.nodes[p].dest) places.push({ label: this.nodes[p].dest, node: this.nodes[p].id });
    }

    var pairs = [], total = 0;
    for (var a = 0; a < places.length; a++) {
      for (var z = 0; z < places.length; z++) {
        if (a === z) continue;
        var from = compOf[places[a].node], to = compOf[places[z].node];
        if (from === undefined || to === undefined) continue;
        if (!reach[from][to]) {
          total++;
          if (pairs.length < limit) pairs.push({ from: places[a].label, to: places[z].label });
        }
      }
    }
    return {
      places: places.length,
      pairs: pairs,
      total: total,
      strong: strong,
      // Direction alone split the graph if there are more strong components
      // than undirected ones.
      oneWaySplit: strong.length > this.components(opts.layers).length
    };
  };

  /** Connected components over the graph — catches paths you forgot to join. */
  NavMap.prototype.components = function (layers) {
    var allow = this.allowSet(layers);
    var seen = new Int32Array(this.nodes.length).fill(-1);
    var groups = [], undirected = {};
    for (var e = 0; e < this.edges.length; e++) {
      var ed = this.edges[e];
      if (!edgeAllowed(ed, allow)) continue;
      (undirected[ed.a] || (undirected[ed.a] = [])).push(ed.b);
      (undirected[ed.b] || (undirected[ed.b] = [])).push(ed.a);
    }
    for (var i = 0; i < this.nodes.length; i++) {
      if (seen[i] !== -1) continue;
      // When scoped to layers, a node with no link on those layers is not part
      // of that network at all — reporting it as a lone island would be noise.
      if (allow && !undirected[i]) continue;
      var id = groups.length, stack = [i], members = [];
      seen[i] = id;
      while (stack.length) {
        var cur = stack.pop();
        members.push(this.nodes[cur].id);
        var nbs = undirected[cur] || [];
        for (var k = 0; k < nbs.length; k++) {
          if (seen[nbs[k]] === -1) { seen[nbs[k]] = id; stack.push(nbs[k]); }
        }
      }
      groups.push(members);
    }
    return groups;
  };

  /* ------------------------------------------------------------------ utils */

  function copy(p) { return { x: p.x, y: p.y }; }

  function dedupe(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = out[out.length - 1];
      if (!q || Math.abs(p.x - q.x) > 1e-6 || Math.abs(p.y - q.y) > 1e-6) out.push(p);
    }
    return out;
  }

  function loadMap(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    return new NavMap(data);
  }

  return {
    version: RUNTIME_VERSION,
    loadMap: loadMap,
    NavMap: NavMap,
    Agent: Agent,
    checkTravel: checkTravel,
    frameAt: frameAt,
    framePath: framePath,
    injectMap: injectMap,
    extractMap: extractMap,
    hasMap: hasMap,
    pointInPoly: pointInPoly,
    segCross: segCross,
    segCrossesPoly: segCrossesPoly
  };
});
