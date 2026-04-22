export type PaginationWindow = {
  page: number;
  pageSize: number;
  from: number;
  to: number;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiSuccessMeta = {
  request_id: string;
  page?: number;
  page_size?: number;
  total?: number;
};
