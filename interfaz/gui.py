import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import traceback
import re
from PIL import Image, ImageTk
import os
from controladores.controladorExpresion import ControladorExpresion

class RegexGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('Expresiones Regulares — GUI')
        self.geometry('800x600')
        self.current_img = None  # Para mantener la referencia de la imagen
        self._build()

    def _build(self):
        frm = ttk.Frame(self, padding=12)
        frm.pack(fill='both', expand=True)

        ttk.Label(frm, text='Expresión regular:').grid(column=0, row=0, sticky='w')
        self.regex_var = tk.StringVar()
        self.regex_entry = ttk.Entry(frm, textvariable=self.regex_var)
        self.regex_entry.grid(column=0, row=1, columnspan=3, sticky='we', pady=(0,8))

        ttk.Button(frm, text='Probar', command=self.run_regex).grid(column=0, row=2, pady=10, sticky='w')

        # Área donde mostraremos la imagen del autómata
        self.img_label = ttk.Label(frm)
        self.img_label.grid(column=0, row=3, columnspan=3, sticky='nsew')

        frm.columnconfigure(0, weight=1)
        frm.rowconfigure(3, weight=1)

    def run_regex(self):
        regex = self.regex_var.get()
        if not regex:
            messagebox.showwarning('Aviso', 'Introduce una expresión regular')
            return
        try:
            automata = ControladorExpresion.build_automaton_from_regex(regex)
            automata.draw()  # Esto genera automata.png

            # Cargar la imagen en Tkinter
            if os.path.exists("automata.png"):
                img = Image.open("automata.png")
                img = img.resize((600, 400), Image.Resampling.LANCZOS)  # 👈 en Pillow >=10 usa Resampling
                self.current_img = ImageTk.PhotoImage(img)
                self.img_label.config(image=self.current_img)
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo generar el autómata:\n{e}")

if __name__ == '__main__':
    app = RegexGUI()
    app.mainloop()
