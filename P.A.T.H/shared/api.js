(function (global) {
  'use strict';

  async function parseJsonResponse(response) {
    const raw = await response.text();
    if (!raw) return {};

    try {
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  function mergeHeaders(baseHeaders, extraHeaders) {
    return Object.assign({}, baseHeaders || {}, extraHeaders || {});
  }

  async function request(path, init) {
    return fetch(path, Object.assign({ credentials: 'include' }, init || {}));
  }

  async function requestJson(path, init) {
    const response = await request(path, init);
    const data = await parseJsonResponse(response);
    return { response: response, data: data };
  }

  function getJson(path, init) {
    return requestJson(path, init);
  }

  function postJson(path, body, init) {
    const options = Object.assign({}, init || {}, {
      method: 'POST',
      headers: mergeHeaders({ 'Content-Type': 'application/json' }, init && init.headers),
      body: JSON.stringify(body || {}),
    });
    return requestJson(path, options);
  }

  function deleteJson(path, init) {
    return requestJson(path, Object.assign({}, init || {}, { method: 'DELETE' }));
  }

  function postForm(path, formData, init) {
    return requestJson(
      path,
      Object.assign({}, init || {}, {
        method: 'POST',
        body: formData,
      }),
    );
  }

  global.PathApi = {
    deleteJson: deleteJson,
    getJson: getJson,
    postForm: postForm,
    postJson: postJson,
    request: request,
    requestJson: requestJson,
  };
})(window);
