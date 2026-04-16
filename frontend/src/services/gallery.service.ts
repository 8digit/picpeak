import { api } from '../config/api';
import type { GalleryInfo, GalleryData, GalleryStats, ResolvedGalleryIdentifier } from '../types';
import { normalizeRequirePassword } from '../utils/accessControl';
import { getApiBaseUrl } from '../utils/url';
import { getGalleryToken } from '../utils/galleryAuthStorage';

// Read admin preview token from URL query string (set when admin clicks "Preview Gallery")
function getPreviewParam(): Record<string, string> {
  const preview = new URLSearchParams(window.location.search).get('preview');
  return preview ? { preview } : {};
}

export const galleryService = {
  // Verify share token
  async verifyToken(slug: string, token: string): Promise<{ valid: boolean }> {
    const response = await api.get<{ valid: boolean }>(`/gallery/${slug}/verify-token/${token}`, { params: getPreviewParam() });
    return response.data;
  },

  // Get basic gallery info (no auth required)
  async getGalleryInfo(slug: string, token?: string): Promise<GalleryInfo> {
    const params = { ...(token ? { token } : {}), ...getPreviewParam() };
    const response = await api.get<GalleryInfo>(`/gallery/${slug}/info`, { params });
    const data = response.data;
    return {
      ...data,
      requires_password: normalizeRequirePassword((data as any)?.requires_password, true),
    };
  },

  // Get gallery photos (requires auth)
  async getGalleryPhotos(
    slug: string,
    filter?: 'liked' | 'favorited' | 'commented' | 'rated' | 'all',
    guestId?: string
  ): Promise<GalleryData> {
    const params: any = {};
    if (filter && filter !== 'all') {
      params.filter = filter;
      if (guestId) {
        params.guest_id = guestId;
      }
    }
    Object.assign(params, getPreviewParam());
    const response = await api.get<GalleryData>(`/gallery/${slug}/photos`, { params });
    const data = response.data;
    const normalizedEvent = data?.event
      ? {
          ...data.event,
          require_password: normalizeRequirePassword((data.event as any)?.require_password, true),
        }
      : data.event;
    return {
      ...data,
      event: normalizedEvent,
    };
  },

  // Download single photo
  async downloadPhoto(slug: string, photoId: number, filename: string): Promise<void> {
    try {
      const response = await api.get(`/gallery/${slug}/download/${photoId}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // Fallback: use the view endpoint if direct download fails (e.g., missing original)
      try {
        const response = await api.get(`/gallery/${slug}/photo/${photoId}`, {
          responseType: 'blob',
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (fallbackErr) {
        throw fallbackErr;
      }
    }
  },

  // Download all photos as ZIP
  //
  // Uses a native browser download (hidden <a download>) instead of an axios
  // request with responseType: 'blob'. The blob approach buffered the ENTIRE
  // ZIP in the JS heap before touching disk, which blew past Safari iOS's
  // per-tab memory cap (~300-500MB) on large galleries and stalled the tab
  // indefinitely. The native path streams straight to disk.
  //
  // Auth: the gallery session JWT lives in sessionStorage. We append it as a
  // ?token= query param so the backend (getGalleryTokenFromRequest) can read
  // it without needing an Authorization header — native <a> clicks cannot set
  // custom headers. The cookie path is NOT reliable here because iOS Safari's
  // ITP drops cookies for stale sessions on cross-site-like navigations.
  async downloadAllPhotos(slug: string): Promise<void> {
    const baseUrl = getApiBaseUrl();
    const jwt = getGalleryToken(slug);
    const url = new URL(`${baseUrl}/gallery/${encodeURIComponent(slug)}/download-all`, window.location.origin);
    if (jwt) {
      url.searchParams.set('token', jwt);
    }

    const link = document.createElement('a');
    link.href = url.toString();
    link.setAttribute('download', `${slug}.zip`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  // Download selected photos as ZIP
  //
  // Same reasoning as downloadAllPhotos: streams natively instead of buffering.
  // Since this endpoint is POST with a JSON body (photo_ids), we use a hidden
  // <form method="POST"> whose submission is a native browser navigation —
  // that triggers the built-in download handler and streams to disk.
  async downloadSelectedPhotos(slug: string, photoIds: number[]): Promise<void> {
    const baseUrl = getApiBaseUrl();
    const jwt = getGalleryToken(slug);
    const action = new URL(`${baseUrl}/gallery/${encodeURIComponent(slug)}/download-selected`, window.location.origin);
    if (jwt) {
      action.searchParams.set('token', jwt);
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action.toString();
    form.style.display = 'none';
    // Backend expects JSON body { photo_ids: [...] }, but a native form submit
    // can only send application/x-www-form-urlencoded or multipart. We encode
    // each id as a repeated "photo_ids" field — the backend already normalizes
    // via Array.isArray(req.body?.photo_ids) on the parsed body.
    photoIds.forEach((id) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'photo_ids';
      input.value = String(id);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    form.remove();
  },

  // Get gallery statistics
  async getGalleryStats(slug: string): Promise<GalleryStats> {
    const response = await api.get<GalleryStats>(`/gallery/${slug}/stats`);
    return response.data;
  },

  async resolveIdentifier(identifier: string): Promise<ResolvedGalleryIdentifier> {
    const response = await api.get<ResolvedGalleryIdentifier>(`/gallery/resolve/${identifier}`, { params: getPreviewParam() });
    return response.data;
  },
};
