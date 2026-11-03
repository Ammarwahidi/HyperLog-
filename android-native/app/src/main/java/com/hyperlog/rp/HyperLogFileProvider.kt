package com.hyperlog.rp

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException

/**
 * Lightweight zero-dependency ContentProvider serving generated PDF and CSV exports
 * from [Context.getCacheDir]/exports via content://com.hyperlog.rp.fileprovider/<fileName>.
 */
class HyperLogFileProvider : ContentProvider() {

    companion object {
        const val AUTHORITY = "com.hyperlog.rp.fileprovider"

        fun exportDir(context: Context): File {
            val dir = File(context.cacheDir, "exports")
            if (!dir.exists()) {
                dir.mkdirs()
            }
            return dir
        }

        fun uriForExportFile(context: Context, file: File): Uri {
            // Ensure file resides inside cacheDir/exports
            val targetDir = exportDir(context)
            val safeFile = if (file.parentFile?.canonicalPath == targetDir.canonicalPath) {
                file
            } else {
                File(targetDir, file.name).also { dest -> file.copyTo(dest, overwrite = true) }
            }
            return Uri.parse("content://$AUTHORITY/${Uri.encode(safeFile.name)}")
        }
    }

    override fun onCreate(): Boolean = true

    private fun resolveSafeExportFile(uri: Uri): File {
        val ctx = context ?: throw FileNotFoundException("Provider context unavailable")
        val rawName = uri.lastPathSegment?.let { Uri.decode(it) }
            ?: throw FileNotFoundException("Missing file name in URI: $uri")
        val root = exportDir(ctx)
        val candidate = File(root, File(rawName).name)
        if (!candidate.canonicalPath.startsWith(root.canonicalPath)) {
            throw SecurityException("Invalid export path outside cache exports directory")
        }
        if (!candidate.exists() || !candidate.isFile) {
            throw FileNotFoundException("Export file not found: ${candidate.name}")
        }
        return candidate
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?
    ): Cursor {
        val file = resolveSafeExportFile(uri)
        val cols = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val names = ArrayList<String>(cols.size)
        val values = ArrayList<Any?>(cols.size)
        for (col in cols) {
            when (col) {
                OpenableColumns.DISPLAY_NAME -> {
                    names.add(OpenableColumns.DISPLAY_NAME)
                    values.add(file.name)
                }
                OpenableColumns.SIZE -> {
                    names.add(OpenableColumns.SIZE)
                    values.add(file.length())
                }
            }
        }
        if (names.isEmpty()) {
            names.add(OpenableColumns.DISPLAY_NAME)
            values.add(file.name)
        }
        return MatrixCursor(names.toTypedArray(), 1).apply {
            addRow(values.toTypedArray())
        }
    }

    override fun getType(uri: Uri): String {
        val name = uri.lastPathSegment?.lowercase() ?: ""
        return when {
            name.endsWith(".pdf") -> "application/pdf"
            name.endsWith(".csv") -> "text/csv"
            name.endsWith(".json") -> "application/json"
            else -> "application/octet-stream"
        }
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val file = resolveSafeExportFile(uri)
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?
    ): Int = 0
}
