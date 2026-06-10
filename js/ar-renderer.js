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

  const DEG = Math.PI / 180;

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

    const azDiff = ((((_sunAzimuth - _deviceHeading) % 360) + 540) % 360) - 180;
    const relAlt = _sunAltitude - _deviceBeta;
    const sobreHorizonte = _sunAltitude > -0.5;

    // Proyectar a coordenadas de pantalla (sin clampear)
    const { x, y, onScreen } = projectSunToScreen(azDiff, relAlt);

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
      const horY = _cam.height / 2 + (_deviceBeta / (_cam.vFOV / 2)) * _cam.height;
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
    horizonLine.classList.add("hidden");
      }
    } else {
      horizonIndicator.classList.add("hidden");
    }

    // ===== 3. FLECHAS DIRECCIONALES =====
    // Aparecen cuando el sol no esta centrado
    const dir = getDirectionFromDevice(azDiff, relAlt);
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
    compassNeedle.style.transform = `rotate(${-_deviceHeading}deg)`;
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

    const margin = 20;
    const onScreen =
      x >= -margin &&
      x <= _cam.width + margin &&
      y >= -margin &&
      y <= _cam.height + margin;

    return { x, y, onScreen };
  }

  /**
   * Proyecta la posicion del sol al BORDE de la pantalla mas cercano.
   * Devuelve {x, y, arrow} o null si esta detras.
   */
  function projectToEdge(azDiff, relAlt) {
    if (Math.abs(azDiff) > 100) return null;
    if (Math.abs(relAlt) > 60) return null;

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

  function getDirectionFromDevice(azDiff, relAlt) {
    const threshold = 8;
    return {
      up: relAlt > threshold,
      down: relAlt < -threshold,
      left: azDiff < -threshold,
      right: azDiff > threshold,
    };
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
  }

  calibrateCamera();
  window.addEventListener("resize", calibrateCamera);

  return { update, reset };
})();
