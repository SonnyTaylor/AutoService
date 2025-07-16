import customtkinter as ctk


def init_view(frame):
    """Initialize the System Info view"""
    ctk.CTkLabel(frame, text="System Info Tab Content").pack(pady=20)
