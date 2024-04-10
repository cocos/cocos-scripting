type Imports = Record<string, string>;

export interface ImportMap {
    imports: Imports,
    scopes: Record<string, Imports>,
}