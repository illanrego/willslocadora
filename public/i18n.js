(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LocadoraI18n = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LOCALES = Object.freeze(['pt-BR', 'en-US']);
  const COPY = Object.freeze({
    'pt-BR': {
      skipShelf: 'Pular para a prateleira', brandTag: 'Seja gentil. Rebobine.', storeYear: 'Ano da loja', previousYear: 'Ano anterior', nextYear: 'Próximo ano', go: 'Ir', immersiveMode: 'Modo imersivo', counter: 'Balcão', sources: 'Fontes', movies: 'Filmes', series: 'Séries', brazilStreaming: 'Streaming no Brasil', allServices: 'Todos os serviços', genre: 'Gênero', year: 'Ano', sound: 'Som', return: 'Voltar', storeAmbience: 'Ambiente da loja', ambienceLevel: 'Nível do ambiente', storeMusic: 'Música da loja', musicTape: 'Fita musical', musicLevel: 'Nível da música', openingBoxes: 'Abrindo as caixas…', openingStand: 'Abrindo outra estante…', tapesFound: 'fitas encontradas', moreTapes: 'fitas a mais carregadas', loadStand: 'Carregar outra estante', emptyTitle: 'Esta prateleira voltou vazia.', emptyBody: 'Tente outro corredor, ano, formato ou fonte de catálogo.', checkBackRoom: 'Verificar o depósito', aisle: 'Corredor', storeYearCaption: 'Ano da loja', moviesLabel: 'Filmes', seriesLabel: 'Séries', theStory: 'SINOPSE', whereToWatchBrazil: 'ONDE ASSISTIR · BRASIL', noProviderListing: 'Nenhuma oferta encontrada', directedBy: 'DIREÇÃO', writtenBy: 'ROTEIRO', starring: 'ELENCO', notListed: 'Não informado', yearUnknown: 'ANO DESCONHECIDO', video: 'VÍDEO', featurePresentation: 'LONGA-METRAGEM', homeVideoSeries: 'SÉRIE PARA CASA', catalogueEdition: 'EDIÇÃO DE CATÁLOGO', catalogueOnly: 'APENAS LISTAGEM DE CATÁLOGO · REPRODUÇÃO E DISPONIBILIDADE PELO SEU STREMIO', toCounter: 'LEVAR AO BALCÃO', returnTape: 'DEVOLVER FITA', watchOptions: 'ONDE ASSISTIR ↗', stremio: 'STREMIO →', vhsFooter: 'VHS · SEJA GENTIL, REBOBINE · ARRASTE PARA INSPECIONAR', language: 'Idioma', portuguese: 'Português', english: 'English', playbackByStremio: 'Reprodução pelo seu Stremio', catalogueDisclaimer: 'Os títulos do catálogo não garantem uma transmissão disponível.', genreAction: 'Ação e aventura', genreComedy: 'Comédia', genreHorror: 'Terror', genreSciFi: 'Ficção científica e fantasia', genreDrama: 'Drama', genreCrime: 'Crime e suspense', genreRomance: 'Romance', genreFamily: 'Família e animação', genreDocumentary: 'Documentário', noSynopsis: 'Nenhuma sinopse foi incluída por esta fonte de catálogo.' },
    'en-US': {
      skipShelf: 'Skip to shelf', brandTag: 'Be kind. Rewind.', storeYear: 'Store year', previousYear: 'Previous store year', nextYear: 'Next store year', go: 'Go', immersiveMode: 'Immersive mode', counter: 'Counter', sources: 'Sources', movies: 'Movies', series: 'Series', brazilStreaming: 'Brazil streaming', allServices: 'All services', genre: 'Genre', year: 'Year', sound: 'Sound', return: 'Return', storeAmbience: 'Store ambience', ambienceLevel: 'Ambience level', storeMusic: 'Store music', musicTape: 'Music tape', musicLevel: 'Music level', openingBoxes: 'Opening the boxes…', openingStand: 'Opening another stand…', tapesFound: 'tapes found', moreTapes: 'more tapes loaded', loadStand: 'Load another stand', emptyTitle: 'This shelf came back empty.', emptyBody: 'Try another aisle, year, format, or catalogue source.', checkBackRoom: 'Check the back room', aisle: 'Aisle', storeYearCaption: 'Store year', moviesLabel: 'Movies', seriesLabel: 'Series', theStory: 'THE STORY', whereToWatchBrazil: 'WHERE TO WATCH · BRAZIL', noProviderListing: 'No provider listing returned', directedBy: 'DIRECTED BY', writtenBy: 'WRITTEN BY', starring: 'STARRING', notListed: 'Not listed', yearUnknown: 'YEAR UNKNOWN', video: 'VIDEO', featurePresentation: 'FEATURE PRESENTATION', homeVideoSeries: 'HOME VIDEO SERIES', catalogueEdition: 'CATALOGUE EDITION', catalogueOnly: 'CATALOGUE LISTING ONLY · PLAYBACK AND AVAILABILITY BY YOUR STREMIO SETUP', toCounter: 'TO COUNTER', returnTape: 'RETURN TAPE', watchOptions: 'WATCH OPTIONS ↗', stremio: 'STREMIO →', vhsFooter: 'VHS · BE KIND, REWIND · DRAG TO INSPECT', language: 'Language', portuguese: 'Português', english: 'English', playbackByStremio: 'Playback by your Stremio', catalogueDisclaimer: 'Catalogue titles are not a promise of an available stream.', genreAction: 'Action & Adventure', genreComedy: 'Comedy', genreHorror: 'Horror', genreSciFi: 'Sci-Fi & Fantasy', genreDrama: 'Drama', genreCrime: 'Crime & Thriller', genreRomance: 'Romance', genreFamily: 'Family & Animation', genreDocumentary: 'Documentary', noSynopsis: 'No synopsis was included by this catalogue source.' },
  });

  function normalizeLocale(value) {
    return LOCALES.includes(value) ? value : 'pt-BR';
  }

  function createTranslator(copy = COPY, locale = 'pt-BR') {
    const active = normalizeLocale(locale);
    return (key) => copy[active]?.[key] ?? copy['pt-BR']?.[key] ?? key;
  }

  function getCopy(locale) {
    return COPY[normalizeLocale(locale)] || COPY['pt-BR'];
  }

  return { COPY, LOCALES, createTranslator, getCopy, normalizeLocale };
}));
