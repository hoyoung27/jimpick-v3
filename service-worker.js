// ============================================================
// 짐픽 AI 이사견적 - 서비스 워커 (오프라인 지원 + 설치 가능하게 만들어줌)
// ------------------------------------------------------------
// 이 파일이 하는 일:
// 1) 앱 화면(HTML)을 기기에 미리 저장해둬서, 인터넷이 끊겨도 앱이 열리게 함
// 2) 크롬이 "이 사이트는 앱으로 설치할 수 있다"고 인식하게 만드는
//    필수 조건 중 하나(서비스 워커 등록)를 만족시켜줌
// ============================================================

const CACHE_NAME = 'jimpick-v3-4-b34';

// 오프라인에서도 열리도록 미리 저장해둘 파일들
// (같은 폴더에 있는 파일 이름을 그대로 적어주세요)
const PRECACHE_URLS = [
  './',
  './index.html',
  './이사견적프로그램.html',
  './manifest.json'
];

// 설치 시: 위 파일들을 미리 다운로드해서 저장
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            /* 파일이 없거나 이름이 다르면 조용히 건너뜀 (에러로 설치 전체가 실패하지 않도록) */
          })
        )
      );
    })
  );
});

// 활성화 시: 이전 버전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 요청이 올 때: 캐시에 있으면 캐시 사용(오프라인 지원),
// 없으면 인터넷에서 받아오고, 그것도 실패하면 저장해둔 첫 화면이라도 보여줌
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match('./index.html'));

      // 캐시가 있으면 우선 보여주고, 백그라운드에서 최신 버전으로 갱신
      return cached || networkFetch;
    })
  );
});
