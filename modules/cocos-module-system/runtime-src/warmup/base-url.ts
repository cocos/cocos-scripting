// @ts-ignore
import { baseUrl as originalBaseUrl } from '../../systemjs/src/common.js';

export let baseUrl = originalBaseUrl;

export function setBaseUrl(url: string) {
    baseUrl = url;
}
