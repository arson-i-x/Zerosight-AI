@echo off
echo === Setting up Python 3.10 virtual environment ===

REM --- CHANGE THIS IF YOUR PYTHON 3.10 PATH IS DIFFERENT ---
set PYTHON=py -3.10

echo Checking Python version...
%PYTHON% --version
if %errorlevel% neq 0 (
    echo.
    echo ERROR: python3.10 not found!
    echo Install Python 3.10 from:
    echo   https://www.python.org/downloads/release/python-31011/
    pause
    exit /b 1
)

echo Creating venv...
%PYTHON% -m venv venv

echo Activating venv...
call venv\Scripts\activate.bat

echo Installing pip upgrade...
py -m pip install --upgrade pip

echo Installing dependencies...
py -m pip install ^
    cmake ^
    face_recognition ^
    dlib ^
    opencv-python ^
    numpy ^
    librosa ^
    pyaudio ^
    requests

echo.
echo === Virtual environment ready! ===
echo To activate later:
echo     venv\Scripts\activate.bat
pause
