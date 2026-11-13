import { useEffect } from 'react';
import type { PublicPage } from '../components/PublicInfoPage.tsx';
import { APP_DESCRIPTION, APP_TITLE } from '../lib/productionMetadata.ts';
import { PUBLIC_PAGE_META, SITE_URL, getDocumentTitle } from './publicPages.ts';

export function upsertMetaTag(attribute: 'name' | 'property', key: string, value: string) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, key);
  element.content = value;
}

export function upsertStructuredData(id: string, payload: Record<string, unknown>) {
  let element = document.head.querySelector(`#${id}`) as HTMLScriptElement | null;
  if (!element) {
    element = document.createElement('script');
    element.type = 'application/ld+json';
    element.id = id;
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(payload);
}

export function useDocumentHead(pathname: string, search: string, publicPage: PublicPage | null) {
  useEffect(() => {
    const title = getDocumentTitle(pathname, publicPage);
    const description = publicPage ? PUBLIC_PAGE_META[publicPage].description : APP_DESCRIPTION;
    const siteOrigin = SITE_URL ?? window.location.origin;
    const basePath = import.meta.env.BASE_URL.replace(/\/?$/, '');
    const canonicalHref = publicPage
      ? `${siteOrigin}${basePath}/${publicPage}`
      : `${siteOrigin}${window.location.pathname}${window.location.search}`;
    const socialImage = `${siteOrigin}${import.meta.env.BASE_URL}social-preview.svg`;

    document.title = title;

    const descriptionMeta = document.head.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (descriptionMeta) {
      descriptionMeta.content = description;
    }

    const canonicalLink = document.head.querySelector('#canonical-url') as HTMLLinkElement | null;
    if (canonicalLink) {
      canonicalLink.href = canonicalHref;
    }

    upsertMetaTag('property', 'og:title', title);
    upsertMetaTag('property', 'og:description', description);
    upsertMetaTag('property', 'og:url', canonicalHref);
    upsertMetaTag('property', 'og:image', socialImage);
    upsertMetaTag('property', 'og:site_name', APP_TITLE);
    upsertMetaTag('name', 'twitter:title', title);
    upsertMetaTag('name', 'twitter:description', description);
    upsertMetaTag('name', 'twitter:image', socialImage);

    upsertStructuredData('app-structured-data', {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: APP_TITLE,
      description,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      url: canonicalHref,
      image: socialImage,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    });
  }, [publicPage, pathname, search]);
}
