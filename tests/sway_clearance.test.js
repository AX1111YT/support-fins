import { blockTopo, analyze, assert, isClosed, isOriented } from './_util.js';
import { swayAtFace, swayClashes, SWAY } from '../web/sway.js';
const ID=[1,0,0,0,1,0,0,0,1];
const side=(topo,sign)=>Array.from({length:topo.nFaces},(_,f)=>f).find(f=>topo.nrm[3*f+1]*sign>.9);

Deno.test('Sway clearance: opposite sides of a thin wall accept both braces, rotated and with cross ribs', () => {
  for(const width of [2,6]) for(const angle of [0,45,90]) for(const cross of [false,true]) {
    const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),rot=[c,s,0,-s,c,0,0,0,1];
    const topo=blockTopo(-50,50,-width/2,width/2,0,200),result=analyze(topo,45,rot);
    const point=(sign)=>[-s*sign*width/2,c*sign*width/2,150];
    const opts={full:true,tines:true,layerHeight:0.2,...(cross?{crossAbove:100,crossRise:0.5}:{})};
    const first=swayAtFace(topo,result,rot,side(topo,-1),point(-1),opts);
    const alone=swayAtFace(topo,result,rot,side(topo,1),point(1),opts);
    assert(first.ok && alone.ok,first.reason??alone.reason);
    const next=swayAtFace(topo,result,rot,side(topo,1),point(1),opts,[first]);
    assert(next.ok,`${width}mm/${angle}deg/cross=${cross}: ${next.reason}`);
    assert(!swayClashes(first,[next]) && !swayClashes(next,[first]));
    assert(isClosed(next.tris) && isOriented(next.tris));
    assert(next.tines>=3);
    const duplicate=swayAtFace(topo,result,rot,side(topo,-1),point(-1),opts,[first]);
    assert(!duplicate.ok,'duplicate brace accepted');
  }
});

Deno.test('Sway clearance: rectangular section overlap and sub-clearance remain clashes', () => {
  const rib=(x0,x1,y,h=200)=>({foot:[[x0,y,0],[x1,y,0]],halfW:2,th:1,height:h,
    levels:[{z:0,a:[x0,y,0],b:[x1,y,0]},{z:h,a:[x0,y,h],b:[x1,y,h]}]});
  const a=rib(0,20,0);
  assert(swayClashes(a,[rib(5,25,3)]),'side-by-side feet overlap');
  assert(swayClashes(a,[rib(20+SWAY.clearance/2,40,0)]),'end gap below clearance');
  assert(!swayClashes(a,[rib(20+SWAY.clearance+0.1,40,0)]),'clear square ends refused');
  const b=rib(0,20,10);b.levels[1]={z:200,a:[0,0,200],b:[20,0,200]};
  assert(swayClashes(a,[b]),'leaning bodies intersect above clear feet');
  b.arms=[{plan:[[-1,-1],[2,-1],[2,1],[-1,1]]}];
  assert(swayClashes(a,[b]),'cross arm intersection ignored');
});
