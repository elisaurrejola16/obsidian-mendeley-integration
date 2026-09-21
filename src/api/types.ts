export interface MendeleyIdentifiers {
  doi?: string;
  isbn?: string;
  issn?: string;
  pmid?: string;
  arxiv?: string;
  [key: string]: string | undefined;
}

export interface MendeleyPersonName {
  first_name?: string;
  last_name?: string;
}

export interface MendeleyDocument {
  id: string;
  title?: string;
  type?: string;
  year?: number;
  source?: string;
  abstract?: string;
  authors?: MendeleyPersonName[];
  editors?: MendeleyPersonName[];
  identifiers?: MendeleyIdentifiers;
  keywords?: string[];
  tags?: string[];
  citation_key?: string;
  websites?: string[];
  created?: string;
  last_modified?: string;
  group_id?: string;
  profile_id?: string;
  file_attached?: boolean;
}

export interface MendeleyFolder {
  id: string;
  name: string;
  parent_id?: string;
}

export interface MendeleyAnnotationPosition {
  top_left: { x: number; y: number };
  bottom_right: { x: number; y: number };
}

export interface MendeleyAnnotation {
  id: string;
  document_id: string;
  type: "highlight" | "note" | string;
  page?: number;
  color?: { r: number; g: number; b: number };
  positions?: MendeleyAnnotationPosition[];
  text?: string;
  privacy_level?: string;
  created?: string;
  last_modified?: string;
}

export interface MendeleyFile {
  id: string;
  document_id: string;
  file_name: string;
  mime_type?: string;
  size?: number;
}

export interface MendeleyTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}
