import React, { useState } from 'react';
import * as XLSX from 'xlsx';

const ExcelToJsonConverter = () => {
  const [jsonData, setJsonData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState('');

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validar que sea un archivo Excel
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ];
    
    if (!validTypes.includes(file.type) && 
        !file.name.endsWith('.xls') && 
        !file.name.endsWith('.xlsx')) {
      setError('Por favor, sube un archivo Excel válido (.xls o .xlsx)');
      return;
    }

    setLoading(true);
    setError('');
    setFileName(file.name);
    
    try {
      // Leer el archivo
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, {
        cellStyles: true,
        cellFormulas: true,
        cellDates: true,
        cellNF: true,
        sheetStubs: true
      });
      
      // Obtener los nombres de las hojas
      const sheets = workbook.SheetNames;
      setSheetNames(sheets);
      
      if (sheets.length > 0) {
        setActiveSheet(sheets[0]);
        // Procesar la primera hoja por defecto
        processSheet(workbook, sheets[0]);
      } else {
        setError('El archivo Excel no contiene hojas');
        setJsonData(null);
      }
    } catch (err) {
      console.error('Error al procesar el archivo:', err);
      setError(`Error al procesar el archivo: ${err.message}`);
      setJsonData(null);
    } finally {
      setLoading(false);
    }
  };

  const processSheet = (workbook, sheetName) => {
    // Obtener la hoja seleccionada
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir la hoja a JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      raw: false,
      defval: null
    });
    
    // Procesar los datos para convertirlos a JSON estructurado
    if (data.length > 0) {
      const headers = data[0];
      
      // Si no hay encabezados, usar datos tal como están
      if (!headers || headers.every(h => h === null)) {
        setJsonData(data);
        return;
      }
      
      // Crear array de objetos usando los encabezados
      const jsonResult = data.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          if (header !== null) {
            obj[header] = index < row.length ? row[index] : null;
          }
        });
        return obj;
      });
      
      setJsonData(jsonResult);
    } else {
      setJsonData([]);
    }
  };

  const handleSheetChange = (e) => {
    const selectedSheet = e.target.value;
    setActiveSheet(selectedSheet);
    
    // Volver a procesar el archivo con la nueva hoja seleccionada
    try {
      const reader = new FileReader();
      const input = document.getElementById('fileInput');
      
      if (input.files.length > 0) {
        reader.onload = (e) => {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, {
            cellStyles: true,
            cellFormulas: true,
            cellDates: true,
            cellNF: true,
            sheetStubs: true
          });
          processSheet(workbook, selectedSheet);
        };
        reader.readAsArrayBuffer(input.files[0]);
      }
    } catch (err) {
      setError(`Error al cambiar de hoja: ${err.message}`);
    }
  };

  const downloadJson = () => {
    if (!jsonData) return;
    
    const jsonString = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/\.(xls|xlsx)$/i, '.json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg shadow-md max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-center mb-6 text-blue-700">Conversor de Excel a JSON</h1>
      
      <div className="mb-6">
        <label className="block text-gray-700 text-sm font-bold mb-2">
          Selecciona un archivo Excel (.xls o .xlsx)
        </label>
        <input
          id="fileInput"
          type="file"
          accept=".xls,.xlsx"
          onChange={handleFileUpload}
          className="w-full p-2 border border-gray-300 rounded"
        />
      </div>
      
      {loading && (
        <div className="text-center py-4">
          <p className="text-blue-600">Procesando archivo...</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {sheetNames.length > 0 && (
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Selecciona una hoja:
          </label>
          <select
            value={activeSheet}
            onChange={handleSheetChange}
            className="w-full p-2 border border-gray-300 rounded"
          >
            {sheetNames.map((sheet) => (
              <option key={sheet} value={sheet}>
                {sheet}
              </option>
            ))}
          </select>
        </div>
      )}
      
      {jsonData && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-semibold">Resultado JSON:</h2>
            <button
              onClick={downloadJson}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Descargar JSON
            </button>
          </div>
          
          <div className="bg-gray-800 text-green-400 p-4 rounded-md overflow-auto max-h-96">
            <pre className="whitespace-pre-wrap text-sm">
              {JSON.stringify(jsonData, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExcelToJsonConverter;
