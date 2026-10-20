/* ==========================================================================
   POSTEVIDENCE APP - FIREBASE CLOUD INTEGRATION (ENHANCED)
   ========================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyD2hJl3gQlJohierXco1mrJ4YYwC4ph7c0",
  authDomain: "post-evidence-app.firebaseapp.com",
  projectId: "post-evidence-app",
  storageBucket: "post-evidence-app.firebasestorage.app",
  messagingSenderId: "532196385091",
  appId: "1:532196385091:web:2017816b1bb2f1d2544ff6",
  measurementId: "G-LNXKDJ7QN0"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentPhotoBase64 = null;
let scannedParcels = [];
let signaturePad = null;
let html5QrCode = null;
let currentGpsCoords = "-";
let dbRecords = [];

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initSignaturePad();
  getGpsLocation(); // ดึง GPS อัตโนมัติทันทีที่เปิดเว็บ
  checkCloudConnection();
  listenToCloudUpdates();

  window.addEventListener('resize', resizeCanvas);
});

function checkCloudConnection() {
  const badge = document.getElementById('db-status-badge');
  db.collection('evidence_records').limit(1).get()
    .then(() => {
      badge.innerHTML = `<i class="fa-solid fa-cloud-check text-success"></i> เชื่อมต่อ Cloud สำเร็จ`;
    })
    .catch((err) => {
      badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-danger"></i> Offline Mode`;
      console.error("Firebase Error:", err);
    });
}

function listenToCloudUpdates() {
  db.collection('evidence_records')
    .orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      dbRecords = [];
      snapshot.forEach(doc => {
        dbRecords.push({ docId: doc.id, ...doc.data() });
      });
      updateHistoryCount();
      renderHistoryList();
    }, (error) => {
      console.error("Cloud fetch error:", error);
    });
}

function initClock() {
  const updateTime = () => {
    const now = new Date();
    const options = { 
      year: 'numeric', month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit' 
    };
    const formatted = now.toLocaleDateString('th-TH', options);
    
    document.getElementById('display-datetime').innerText = formatted;
    if (document.getElementById('watermark-time')) {
      document.getElementById('watermark-time').innerText = formatted;
    }
  };
  updateTime();
  setInterval(updateTime, 1000);
}

function getGpsLocation() {
  const gpsText = document.getElementById('gps-text');
  gpsText.innerText = "กำลังค้นหาสัญญาณ GPS หน้างาน...";
  
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        currentGpsCoords = `${lat}, ${lng}`;
        gpsText.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> ${currentGpsCoords}`;
      },
      (error) => {
        currentGpsCoords = "13.756331, 100.501832 (จำลองหน้างาน)";
        gpsText.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> ${currentGpsCoords}`;
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  } else {
    currentGpsCoords = "13.756331, 100.501832 (จำลอง)";
    gpsText.innerText = currentGpsCoords;
  }
}

function triggerCameraInput() {
  document.getElementById('camera-input').click();
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      compressImage(e.target.result, 800, 0.7, (compressedBase64) => {
        currentPhotoBase64 = compressedBase64;
        document.getElementById('photo-preview').src = currentPhotoBase64;
        document.getElementById('photo-placeholder').classList.add('hidden');
        document.getElementById('photo-preview-container').classList.remove('hidden');
      });
    };
    reader.readAsDataURL(file);
  }
}

function compressImage(base64, maxWidth, quality, callback) {
  const img = new Image();
  img.src = base64;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;

    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
}

function toggleCameraScanner() {
  const viewport = document.getElementById('qr-reader-container');
  viewport.classList.remove('hidden');
  
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("qr-reader");
  }

  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 150 } },
    (decodedText) => {
      playBeepSound();
      addParcelToList(decodedText);
    },
    (err) => {}
  ).catch(err => {
    alert("ไม่สามารถเปิดกล้องสแกนได้");
  });
}

function stopCameraScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      document.getElementById('qr-reader-container').classList.add('hidden');
    });
  } else {
    document.getElementById('qr-reader-container').classList.add('hidden');
  }
}

function addTrackingFromInput() {
  const input = document.getElementById('manual-tracking-input');
  const code = input.value.trim().toUpperCase();
  if (code) {
    addParcelToList(code);
    input.value = '';
  }
}

// ฟังก์ชันเพิ่ม Tracking หลายบรรทัดพร้อมกันจาก Textarea
function addBulkTrackingFromTextarea() {
  const textarea = document.getElementById('bulk-tracking-textarea');
  const lines = textarea.value.split('\n');
  let addedCount = 0;

  lines.forEach(line => {
    const code = line.trim().toUpperCase();
    if (code && !scannedParcels.includes(code)) {
      scannedParcels.push(code);
      addedCount++;
    }
  });

  if (addedCount > 0) {
    renderParcelList();
    textarea.value = '';
    alert(`เพิ่มพัสดุสำเร็จ ${addedCount} รายการ`);
  } else {
    alert('ไม่พบข้อมูลเลขพัสดุใหม่ที่ถูกต้องในช่องข้อความ');
  }
}

function addParcelToList(trackingNo) {
  if (scannedParcels.includes(trackingNo)) return;
  scannedParcels.push(trackingNo);
  renderParcelList();
}

function removeParcel(index) {
  scannedParcels.splice(index, 1);
  renderParcelList();
}

function clearAllParcels() {
  if (scannedParcels.length === 0) return;
  if (confirm('ต้องการล้างรายการพัสดุทั้งหมดใช่หรือไม่?')) {
    scannedParcels = [];
    renderParcelList();
  }
}

function renderParcelList() {
  const listEl = document.getElementById('parcel-list');
  const countBadge = document.getElementById('scanned-count-badge');
  countBadge.innerText = `${scannedParcels.length} ชิ้น`;

  if (scannedParcels.length === 0) {
    listEl.innerHTML = `<div class="empty-state">ยังไม่มีรายการพัสดุ สแกนบาร์โค้ดหรือกรอกเพื่อเริ่มเพิ่มรายการ</div>`;
    return;
  }

  listEl.innerHTML = scannedParcels.map((code, index) => `
    <div class="parcel-item">
      <span><i class="fa-solid fa-box-archive"></i> ${index + 1}. ${code}</span>
      <button type="button" class="btn-text text-danger" onclick="removeParcel(${index})">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');
}

function playBeepSound() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 800;
  osc.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}

function initSignaturePad() {
  const canvas = document.getElementById('signature-pad');
  signaturePad = new SignaturePad(canvas, {
    penColor: 'rgb(0, 51, 102)',
    minWidth: 1.5,
    maxWidth: 3.5,
    throttle: 16
  });
  resizeCanvas();
}

function resizeCanvas() {
  const canvas = document.getElementById('signature-pad');
  const container = document.getElementById('canvas-container');
  if (!container || !canvas) return;

  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = container.clientWidth * ratio;
  canvas.height = container.clientHeight * ratio;
  canvas.getContext("2d").scale(ratio, ratio);
  if (signaturePad) signaturePad.clear();
}

function clearSignature() {
  if (signaturePad) signaturePad.clear();
}

function saveEvidenceRecord() {
  const senderName = document.getElementById('sender-name').value.trim();
  const senderPhone = document.getElementById('sender-phone').value.trim();
  const locationName = document.getElementById('location-name').value.trim() || 'จุดรับฝาก EMS Point';

  if (scannedParcels.length === 0) {
    alert('กรุณาสแกนหรือกรอกเลขพัสดุอย่างน้อย 1 ชิ้น');
    return;
  }

  if (signaturePad.isEmpty()) {
    alert('กรุณาเซ็นลายมือชื่อผู้ฝากส่งเพื่อยืนยัน');
    return;
  }

  const saveBtn = document.getElementById('btn-save');
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกลง Cloud...`;

  const recordId = 'EV-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(1000 + Math.random() * 9000);

  const recordData = {
    id: recordId,
    timestamp: document.getElementById('display-datetime').innerText,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    gps: currentGpsCoords,
    location: locationName,
    senderName: senderName || 'ผู้ฝากส่งทั่วไป',
    senderPhone: senderPhone || '-',
    parcels: [...scannedParcels],
    photo: currentPhotoBase64 || createPlaceholderPhoto(),
    signature: signaturePad.toDataURL()
  };

  db.collection('evidence_records').add(recordData)
    .then(() => {
      alert(`บันทึกหลักฐานขึ้นระบบ Cloud เรียบร้อยแล้ว!\nเลขที่เอกสาร: ${recordId}`);
      resetForm();
      openEvidenceModalData(recordData);
    })
    .catch((error) => {
      alert("เกิดข้อผิดพลาดในการบันทึก: " + error.message);
    })
    .finally(() => {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> บันทึกหลักฐานเข้าระบบ Cloud`;
    });
}

function resetForm() {
  scannedParcels = [];
  renderParcelList();
  clearSignature();
  document.getElementById('sender-name').value = '';
  document.getElementById('sender-phone').value = '';
  document.getElementById('location-name').value = '';
  document.getElementById('photo-preview-container').classList.add('hidden');
  document.getElementById('photo-placeholder').classList.remove('hidden');
  currentPhotoBase64 = null;
  getGpsLocation();
}

function createPlaceholderPhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = 400; canvas.height = 250;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = "#e0e0e0";
  ctx.fillRect(0,0,400,250);
  ctx.fillStyle = "#666";
  ctx.font = "16px Prompt";
  ctx.fillText("ภาพหลักฐานการรับสินค้า", 120, 130);
  return canvas.toDataURL();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  document.getElementById(`tab-btn-${tabName}`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  if (tabName === 'form') {
    setTimeout(resizeCanvas, 100);
  }
}

function updateHistoryCount() {
  document.getElementById('history-count').innerText = dbRecords.length;
}

function renderHistoryList() {
  const container = document.getElementById('history-list-container');
  if (dbRecords.length === 0) {
    container.innerHTML = `<div class="empty-state">ยังไม่มีประวัติการรับพัสดุในระบบ Cloud</div>`;
    return;
  }

  container.innerHTML = dbRecords.map(item => `
    <div class="history-card">
      <div class="history-info">
        <div class="date"><i class="fa-regular fa-clock"></i> ${item.timestamp} | ${item.id}</div>
        <div class="sender"><i class="fa-solid fa-store"></i> ${item.senderName} (${item.location})</div>
        <div class="tracking-summary">
          <i class="fa-solid fa-boxes-packing"></i> พัสดุ ${item.parcels.length} ชิ้น: ${item.parcels.slice(0, 2).join(', ')}${item.parcels.length > 2 ? '...' : ''}
        </div>
      </div>
      <button type="button" class="btn btn-outline btn-sm" onclick="openEvidenceModal('${item.id}')">
        <i class="fa-solid fa-file-pdf"></i> เอกสาร A4
      </button>
    </div>
  `).join('');
}

function filterHistory() {
  const query = document.getElementById('history-search').value.toLowerCase();
  document.querySelectorAll('.history-card').forEach(card => {
    card.style.display = card.innerText.toLowerCase().includes(query) ? 'flex' : 'none';
  });
}

function openEvidenceModal(recordId) {
  const record = dbRecords.find(r => r.id === recordId);
  if (record) openEvidenceModalData(record);
}

function openEvidenceModalData(record) {
  document.getElementById('a4-doc-id').innerText = record.id;
  document.getElementById('a4-doc-date').innerText = record.timestamp;
  document.getElementById('a4-location').innerText = record.location;
  document.getElementById('a4-gps').innerText = record.gps;
  document.getElementById('a4-sender-name').innerText = record.senderName;
  document.getElementById('a4-sender-phone').innerText = record.senderPhone;
  document.getElementById('a4-total-qty').innerText = record.parcels.length;

  const tbody = document.getElementById('a4-parcel-tbody');
  tbody.innerHTML = record.parcels.map((code, idx) => `
    <tr>
      <td style="text-align:center">${idx + 1}</td>
      <td style="font-family:monospace; font-weight:bold">${code}</td>
      <td style="text-align:center">EMS Point / FastTrack</td>
      <td style="text-align:center; color:green;">รับฝากเรียบร้อย</td>
    </tr>
  `).join('');

  document.getElementById('a4-photo-img').src = record.photo;
  document.getElementById('a4-sign-img').src = record.signature;
  document.getElementById('a4-sign-name-text').innerText = record.senderName;

  document.getElementById('evidence-modal').classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

function printA4Document() {
  window.print();
}

function downloadPDF() {
  const element = document.getElementById('a4-document');
  const docId = document.getElementById('a4-doc-id').innerText;
  const opt = {
    margin:       0,
    filename:     `Pickup_Certificate_${docId}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(element).save();
}

function exportAllDataCSV() {
  if (dbRecords.length === 0) {
    alert("ไม่มีข้อมูลสำหรับส่งออก");
    return;
  }
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  csvContent += "เลขที่เอกสาร,วันที่เวลา,ผู้ฝากส่ง,เบอร์โทร,สถานที่,พิกัดGPS,จำนวนพัสดุ,รายการTracking\n";

  dbRecords.forEach(r => {
    const row = [
      r.id,
      `"${r.timestamp}"`,
      `"${r.senderName}"`,
      `"${r.senderPhone}"`,
      `"${r.location}"`,
      `"${r.gps}"`,
      r.parcels.length,
      `"${r.parcels.join(';')}"`
    ].join(',');
    csvContent += row + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `PostEvidence_Report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}