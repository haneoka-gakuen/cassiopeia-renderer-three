import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, type Material } from "three";
import type { NativeIntroSpriteData } from "@haneoka/cassiopeia-plugin-our-notes";
import type { NativeIntroScene } from "./NativeIntroScene";

export interface NativeIntroSpriteVisual {
  transformId: string;
  sprite: NativeIntroSpriteData;
  drawMode: 0 | 1 | 2;
  /** Original SpriteRenderer.m_Size, in Unity units. */
  size: readonly [number, number];
  flipX: boolean;
  flipY: boolean;
  layer: 25 | 29;
  sortingLayer: 0 | 1;
  sortingOrder: number;
  /** Actual nearest enabled SortingGroup; these intro groups use order4102. */
  sortingGroup?: { key: string; order: number };
  material: Material;
  /** The hand-written material factory retains ownership and updates original renderer colour. */
  setColour: (colour: readonly [number, number, number, number]) => void;
}
interface IntroSpriteInstance {
  spec: NativeIntroSpriteVisual;
  mesh: Mesh;
}
const Z_REFLECTION = new Matrix4().makeScale(1, 1, -1);

type TileVertex = { x: number; y: number; z: number; u: number; v: number };

function clipTileEdge(vertices: TileVertex[], axis: "x" | "y", edge: number): TileVertex[] {
  const output: TileVertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
    const insideA = a[axis] <= edge, insideB = b[axis] <= edge;
    if (insideA) output.push(a);
    if (insideA === insideB) continue;
    const t = (edge - a[axis]) / (b[axis] - a[axis]);
    output.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      u: a.u + (b.u - a.u) * t,
      v: a.v + (b.v - a.v) * t,
    });
  }
  return output;
}

function tiledSpriteGeometry(spec: NativeIntroSpriteVisual): BufferGeometry {
  const { sprite, size: [width, height], flipX, flipY } = spec;
  const tileWidth = Math.fround(sprite.rect[2] / sprite.pixelsToUnits);
  const tileHeight = Math.fround(sprite.rect[3] / sprite.pixelsToUnits);
  if (sprite.border.some((value) => value !== 0) ||
      ![width, height, tileWidth, tileHeight].every(Number.isFinite) ||
      width <= 0 || height <= 0 || tileWidth <= 0 || tileHeight <= 0)
    throw new Error("Unsupported authored intro tile geometry");
  const vertices: TileVertex[] = [];
  for (let i = 0; i < sprite.positions.length / 3; i++) {
    vertices.push({
      x: sprite.positions[i * 3]! + tileWidth / 2,
      y: sprite.positions[i * 3 + 1]! + tileHeight / 2,
      z: sprite.positions[i * 3 + 2]!,
      u: sprite.uv[i * 2]!,
      v: sprite.uv[i * 2 + 1]!,
    });
  }
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row < Math.ceil(height / tileHeight); row++) {
    const y = row * tileHeight, remainingY = height - y;
    for (let column = 0; column < Math.ceil(width / tileWidth); column++) {
      const x = column * tileWidth, remainingX = width - x;
      for (let i = 0; i < sprite.indices.length; i += 3) {
        let polygon = [
          vertices[sprite.indices[i]!]!,
          vertices[sprite.indices[i + 1]!]!,
          vertices[sprite.indices[i + 2]!]!,
        ];
        // Continuous tiles retain the Sprite's trimmed geometry and crop only the last tile.
        if (remainingX < tileWidth) polygon = clipTileEdge(polygon, "x", remainingX);
        if (remainingY < tileHeight) polygon = clipTileEdge(polygon, "y", remainingY);
        if (polygon.length < 3) continue;
        const base = positions.length / 3;
        for (const vertex of polygon) {
          positions.push(
            (x + vertex.x - width / 2) * (flipX ? -1 : 1),
            (y + vertex.y - height / 2) * (flipY ? -1 : 1),
            -vertex.z,
          );
          uv.push(vertex.u, vertex.v);
        }
        for (let index = 1; index + 1 < polygon.length; index++)
          indices.push(base, base + index, base + index + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(Float32Array.from(uv), 2));
  geometry.setIndex(indices);
  return geometry;
}

function spriteGeometry(spec: NativeIntroSpriteVisual): BufferGeometry {
  if (spec.drawMode === 2) return tiledSpriteGeometry(spec);
  const data = spec.sprite;
  const positions = new Float32Array(data.positions);
  let scaleX = spec.flipX ? -1 : 1, scaleY = spec.flipY ? -1 : 1;
  if (spec.drawMode === 1) {
    // All six actual sliced intro bases have zero borders. Their sole non-degenerate
    // centre cell is exactly the original quad stretched to m_Size; no guessed edge widths.
    if (data.border.some((value) => value !== 0) || data.positions.length !== 12 ||
        data.textureRectOffset.some((value) => value !== 0))
      throw new Error("Unsupported authored intro Sprite slice boundary");
    if (data.rect[2] <= 0 || data.rect[3] <= 0 || !Number.isFinite(spec.size[0]) || !Number.isFinite(spec.size[1]) ||
        spec.size[0] < 0 || spec.size[1] < 0)
      throw new Error("Invalid authored intro Sprite size");
    scaleX *= spec.size[0] * data.pixelsToUnits / data.rect[2];
    scaleY *= spec.size[1] * data.pixelsToUnits / data.rect[3];
  } else if (spec.drawMode !== 0) throw new Error("Unsupported native intro Sprite draw mode");
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = positions[index]! * scaleX;
    positions[index + 1] = positions[index + 1]! * scaleY;
    positions[index + 2] = -positions[index + 2]!;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(data.uv, 2));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  return geometry;
}

/** Original intro SpriteRenderer geometry, pass grouping and animated world poses. */
export class NativeIntroSpriteLayer {
  readonly game = new Group();
  readonly effects = new Group();
  private readonly instances: IntroSpriteInstance[] = [];
  private readonly byTransform = new Map<string, IntroSpriteInstance[]>();
  private readonly sortingGroups = new Map<string, Group>();
  private readonly worldScratch = new Matrix4();

  constructor(private readonly scene: NativeIntroScene, specs: ReadonlyArray<NativeIntroSpriteVisual>) {
    for (const spec of specs) {
      if (!Number.isInteger(spec.sortingOrder) || spec.sortingOrder < -32768 || spec.sortingOrder > 32767 ||
          (spec.layer !== 25 && spec.layer !== 29))
        throw new Error("Unsupported authored intro Sprite layer/order");
      const mesh = new Mesh(spriteGeometry(spec), spec.material);
      mesh.name = `OurNotesNativeIntroSprite:${spec.transformId}`;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      mesh.visible = false;
      // Unity compares the layer first, then the signed 16-bit order.
      mesh.renderOrder = spec.sortingLayer * 65536 + spec.sortingOrder;
      this.attachVisual(mesh, spec.layer, spec.sortingGroup);
      const instance = { spec, mesh };
      this.instances.push(instance);
      let values = this.byTransform.get(spec.transformId);
      if (!values) this.byTransform.set(spec.transformId, values = []);
      values.push(instance);
    }
  }

  /** Preserve an original SortingGroup across its Sprite and SkinnedMesh renderers. */
  attachVisual(mesh: Mesh, layer: 25 | 29, sortingGroup?: { key: string; order: number }): void {
    let parent = layer === 25 ? this.game : this.effects;
    if (sortingGroup) {
      if (!Number.isFinite(sortingGroup.order)) throw new Error("Invalid native intro SortingGroup order");
      const key = `${layer}:${sortingGroup.key}`;
      let group = this.sortingGroups.get(key);
      if (!group) {
        group = new Group(); group.renderOrder = sortingGroup.order;
        parent.add(group); this.sortingGroups.set(key, group);
      } else if (group.renderOrder !== sortingGroup.order) throw new Error("Native intro SortingGroup identity changed");
      parent = group;
    }
    parent.add(mesh);
  }

  update(): void {
    this.scene.updateWorldMatrices();
    for (const instance of this.instances) {
      instance.mesh.visible = this.scene.isActive(instance.spec.transformId);
      if (!instance.mesh.visible) continue;
      this.worldScratch.fromArray(this.scene.boneWorldMatrix(instance.spec.transformId));
      // Geometry is already reflected once; conjugate the source TRS so the total is S*M*v.
      instance.mesh.matrix.copy(Z_REFLECTION).multiply(this.worldScratch).multiply(Z_REFLECTION);
      instance.mesh.matrixWorldNeedsUpdate = true;
    }
  }
  setColour(transformId: string, colour: readonly [number, number, number, number]): void {
    if (!colour.every(Number.isFinite)) throw new Error("Invalid native intro Sprite colour");
    const values = this.byTransform.get(transformId);
    if (!values) throw new Error("Original animated intro Sprite renderer missing");
    for (const instance of values) instance.spec.setColour(colour);
  }
  dispose(): void {
    for (const instance of this.instances) { instance.mesh.geometry.dispose(); instance.mesh.removeFromParent(); }
    this.game.removeFromParent(); this.effects.removeFromParent();
    this.instances.length = 0; this.byTransform.clear(); this.sortingGroups.clear();
  }
}
