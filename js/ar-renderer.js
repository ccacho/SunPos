/**
 * ARRenderer.js - Renderiza la posicion del sol
 * - Circulo solar: solo visible cuando esta DENTRO de la pantalla
 * - Arco direccional en el borde: indica por donde esta el sol cuando esta fuera
 * - Flechas centrales: guian para orientar el dispositivo
 */

const ARRenderer = (() => {
  const $ = (id) => document.getElementById(id);
  const sunOverlay = $("sun-overlay");
  const sunCircle = $("sun-circle");
  const sunLabel = $("sun-label");
  const searchIndicator = $("search-indicator");
  const searchText = $("search-text");
  const arrowUp = $("arrow-up");
  const arrowDown = $("arrow-down");
  const arrowLeft = $("arrow-left");
  const arrowRight = $("arrow-right");
  const compassNeedle = $("compass-needle");
  const horizonIndicator = $("horizon-indicator");
  const horizonArrow = $("horizon-arrow");
  const horizonLabel = $("horizon-label");
  const horizonLine = $("horizon-line");

  let _cam = {
    vFOV: 50,
    hFOV: 65,
    width: window.innerWidth,
    height: window.innerHeight,
  };

  let _sunAzimuth = 0;
  let _sunAltitude = 0;
  let _deviceHeading = 0;
  let _deviceBeta = 0;

  let _smooth = {
    azDiff: null,
    relAlt: null,
    heading: null,
    beta: null,
  };

  let _ui = {
    sunVisible: false,
    edgeVisible: false,
    dir: { up: false, down: false, left: false, right: false },
  };

  function calibrateCamera() {
    _cam.width = window.innerWidth;
    _cam.height = window.innerHeight;
    // FOV fijo de camara trasera (~65° horiz, ~50° vert), no depende de pantalla
    _cam.vFOV = 50;
    _cam.hFOV = 65;
  }

  function update(sunAzimuth, sunAltitude, deviceHeading, deviceBeta) {
    _sunAzimuth = sunAzimuth;
    _sunAltitude = sunAltitude;
    _deviceHeading = deviceHeading;
    _deviceBeta = deviceBeta || 0;
    render();
  }

  function render() {
    calibrateCamera();

    const azDiff = smoothValue("azDiff", angleDiff(_sunAzimuth, _deviceHeading), 0.18);
    const relAlt = smoothValue("relAlt", _sunAltitude - _deviceBeta, 0.18);
    const sobreHorizonte = _sunAltitude > -0.5;

    // Proyectar a coordenadas de pantalla (sin clampear)
    const { x, y } = projectSunToScreen(azDiff, relAlt);
    const onScreen = isOnScreenStable(x, y, sobreHorizonte);

    // ===== 1. CIRCULO DEL SOL =====
    // Solo se muestra cuando esta DENTRO de la pantalla y sobre el horizonte
    if (onScreen && sobreHorizonte) {
      sunOverlay.classList.remove("hidden");
      sunOverlay.style.left = x + "px";
      sunOverlay.style.top = y + "px";
      sunCircle.style.opacity = 1;
      sunCircle.style.transform = `scale(${Math.max(0.4, Math.min(1, (_sunAltitude + 10) / 90))})`;
      sunLabel.style.opacity = 1;
      sunLabel.textContent = `${Math.round(_sunAltitude)}° sobre horizonte`;
    } else {
      sunOverlay.classList.add("hidden");
    }

    // ===== 1.5. LINEA DEL HORIZONTE =====
    // Se mueve con la inclinacion de la camara
    if (true) {
      const beta = smoothValue("beta", _deviceBeta, 0.18);
      const horY = _cam.height / 2 + (beta / (_cam.vFOV / 2)) * _cam.height;
      horizonLine.classList.remove("hidden");
      horizonLine.style.top = horY + "px";
      horizonLine.style.display = "block";
    }

    // ===== 2. INDICADOR EN EL BORDE =====
    // Muestra una flecha en el borde de la pantalla indicando donde esta el sol
    // cuando esta fuera de la pantalla
    if (!onScreen || !sobreHorizonte) {
      const edgePos = projectToEdge(azDiff, relAlt);
      if (edgePos) {
        horizonIndicator.classList.remove("hidden");
        horizonIndicator.style.left = edgePos.x + "px";
        horizonIndicator.style.top = edgePos.y + "px";

        if (sobreHorizonte) {
          horizonArrow.textContent = edgePos.arrow;
          horizonLabel.textContent = `Sol ${Math.round(Math.abs(azDiff))}° ${azDiff > 0 ? "der" : "izq"}, ${Math.round(Math.abs(relAlt))}° ${relAlt > 0 ? "arriba" : "abajo"}`;
        } else {
          horizonArrow.textContent = "▼";
          horizonLabel.textContent = `Sol ${Math.round(Math.abs(_sunAltitude))}° bajo horizonte`;
        }
      } else {
        horizonIndicator.classList.add("hidden");
        _ui.edgeVisible = false;
      }
    } else {
      horizonIndicator.classList.add("hidden");
      _ui.edgeVisible = false;
    }

    // ===== 3. FLECHAS DIRECCIONALES =====
    // Aparecen cuando el sol no esta centrado
    const dir = getStableDirection(azDiff, relAlt);
    const needsArrows = dir.up || dir.down || dir.left || dir.right;
    if (needsArrows) {
      searchIndicator.classList.remove("hidden");
      showArrows(dir);
      if (sobreHorizonte) {
        searchText.textContent = `Sol: ${Math.round(Math.abs(azDiff))}° ${azDiff > 0 ? "→" : "←"}, ${Math.round(Math.abs(relAlt))}° ${relAlt > 0 ? "↑" : "↓"}`;
      } else {
        searchText.textContent = `Sol ${Math.round(Math.abs(_sunAltitude))}° bajo horizonte`;
      }
    } else {
      searchIndicator.classList.add("hidden");
    }

    // ===== 4. BRUJULA =====
    const heading = smoothAngle("heading", _deviceHeading, 0.18);
    compassNeedle.style.transform = `rotate(${-heading}deg)`;
  }

  function angleDiff(target, current) {
    return ((((target - current) % 360) + 540) % 360) - 180;
  }

  function smoothValue(key, value, alpha) {
    if (_smooth[key] === null || !Number.isFinite(_smooth[key])) {
      _smooth[key] = value;
      return value;
    }
    _smooth[key] += (value - _smooth[key]) * alpha;
    return _smooth[key];
  }

  function smoothAngle(key, angle, alpha) {
    if (_smooth[key] === null || !Number.isFinite(_smooth[key])) {
      _smooth[key] = angle;
      return angle;
    }
    _smooth[key] = (_smooth[key] + angleDiff(angle, _smooth[key]) * alpha + 360) % 360;
    return _smooth[key];
  }

  function isOnScreenStable(x, y, sobreHorizonte) {
    const margin = _ui.sunVisible ? 70 : 12;
    const altitudeLimit = _ui.sunVisible ? -1.5 : -0.5;
    _ui.sunVisible =
      _sunAltitude > altitudeLimit &&
      (sobreHorizonte || _ui.sunVisible) &&
      x >= -margin &&
      x <= _cam.width + margin &&
      y >= -margin &&
      y <= _cam.height + margin;
    return _ui.sunVisible;
  }

  /**
   * Proyecta el sol a coordenadas de pantalla.
   * NO clampea: las coordenadas pueden estar fuera.
   */
  function projectSunToScreen(azDiff, relAlt) {
    const xRatio = azDiff / _cam.hFOV;
    const yRatio = relAlt / (_cam.vFOV / 2);

    let x = _cam.width / 2 + xRatio * _cam.width;
    let y = _cam.height / 2 - yRatio * _cam.height;

    return { x, y };
  }

  /**
   * Proyecta la posicion del sol al BORDE de la pantalla mas cercano.
   * Devuelve {x, y, arrow} o null si esta detras.
   */
  function projectToEdge(azDiff, relAlt) {
    const azLimit = _ui.edgeVisible ? 125 : 105;
    const altLimit = _ui.edgeVisible ? 80 : 65;
    if (Math.abs(azDiff) > azLimit) {
      _ui.edgeVisible = false;
      return null;
    }
    if (Math.abs(relAlt) > altLimit) {
      _ui.edgeVisible = false;
      return null;
    }
    _ui.edgeVisible = true;

    const xRatio = azDiff / _cam.hFOV;
    const yRatio = relAlt / (_cam.vFOV / 2);

    const cx = _cam.width / 2;
    const cy = _cam.height / 2;
    let x = cx + xRatio * _cam.width;
    let y = cy - yRatio * _cam.height;

    // Determinar que borde esta mas cerca
    const dists = {
      left: Math.abs(x - 0),
      right: Math.abs(x - _cam.width),
      top: Math.abs(y - 0),
      bottom: Math.abs(y - _cam.height),
    };

    // Encontrar el borde mas cercano
    let minDist = Infinity;
    let edge = "left";
    for (const [k, v] of Object.entries(dists)) {
      if (v < minDist) {
        minDist = v;
        edge = k;
      }
    }

    // Proyectar al borde
    switch (edge) {
      case "left":
        x = 15;
        y = Math.max(30, Math.min(_cam.height - 30, y));
        break;
      case "right":
        x = _cam.width - 15;
        y = Math.max(30, Math.min(_cam.height - 30, y));
        break;
      case "top":
        x = Math.max(30, Math.min(_cam.width - 30, x));
        y = 15;
        break;
      case "bottom":
        x = Math.max(30, Math.min(_cam.width - 30, x));
        y = _cam.height - 15;
        break;
    }

    // Flecha que apunta hacia donde esta el sol
    const arrowMap = {
      left: "\u25B6",
      right: "\u25C0",
      top: "\u25BC",
      bottom: "\u25B2",
    };

    return { x, y, arrow: arrowMap[edge] };
  }

  function getStableDirection(azDiff, relAlt) {
    const enter = 10;
    const exit = 5;
    _ui.dir.up = _ui.dir.up ? relAlt > exit : relAlt > enter;
    _ui.dir.down = _ui.dir.down ? relAlt < -exit : relAlt < -enter;
    _ui.dir.left = _ui.dir.left ? azDiff < -exit : azDiff < -enter;
    _ui.dir.right = _ui.dir.right ? azDiff > exit : azDiff > enter;
    return { ..._ui.dir };
  }

  function showArrows(dir) {
    arrowUp.classList.toggle("hidden", !dir.up);
    arrowDown.classList.toggle("hidden", !dir.down);
    arrowLeft.classList.toggle("hidden", !dir.left);
    arrowRight.classList.toggle("hidden", !dir.right);
    arrowUp.classList.toggle("visible", dir.up);
    arrowDown.classList.toggle("visible", dir.down);
    arrowLeft.classList.toggle("visible", dir.left);
    arrowRight.classList.toggle("visible", dir.right);
  }

  function reset() {
    sunOverlay.classList.add("hidden");
    searchIndicator.classList.add("hidden");
    horizonIndicator.classList.add("hidden");
    _smooth = { azDiff: null, relAlt: null, heading: null, beta: null };
    _ui = {
      sunVisible: false,
      edgeVisible: false,
      dir: { up: false, down: false, left: false, right: false },
    };
  }

  calibrateCamera();
  window.addEventListener("resize", calibrateCamera);

  return { update, reset };
})();
