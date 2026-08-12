import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { ConfirmDialog, Alert } from '@/components/ui'
import { Upload, Download, Trash2, FileText, Image as ImageIcon, Paperclip } from 'lucide-react'
import { formatBytes, formatDate } from '@/lib/utils'
import type { Attachment, AttachmentEntityType } from '@/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

interface AttachmentListProps {
  entityType: AttachmentEntityType
  entityId: string
}

export function AttachmentList({ entityType, entityId }: AttachmentListProps) {
  const { t } = useTranslation('common')
  const { profile, user } = useAuth()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isCompanyAdmin = profile?.role === 'company_admin'

  const fetchAttachments = async () => {
    if (!entityId) return
    const { data, error } = await supabase
      .from('attachments')
      .select(`
        *,
        uploader:user_profiles!attachments_uploaded_by_fkey(full_name)
      `)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      setError(error.message)
    } else {
      const rows = (data ?? []) as unknown as Array<Attachment & {
        uploader: { full_name: string } | null
      }>
      setAttachments(
        rows.map((r) => ({
          ...r,
          uploader_name: r.uploader?.full_name ?? undefined,
        }))
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAttachments()
  }, [entityType, entityId])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError(t('common:attachments.invalidType'))
      e.target.value = ''
      return
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(t('common:attachments.fileTooLarge'))
      e.target.value = ''
      return
    }

    setUploading(true)

    try {
      // Generate a unique file path: {company_id}/{entity_type}/{entity_id}/{timestamp}_{filename}
      const companyId = profile?.company_id
      if (!companyId) {
        setError(t('common:attachments.uploadFailed'))
        setUploading(false)
        return
      }

      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const timestamp = Date.now()
      const filePath = `${companyId}/${entityType}s/${entityId}/${timestamp}_${safeFileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        setError(uploadError.message)
        setUploading(false)
        e.target.value = ''
        return
      }

      // Insert metadata into attachments table
      const { error: insertError } = await supabase.from('attachments').insert({
        entity_type: entityType,
        entity_id: entityId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user?.id ?? null,
      })

      if (insertError) {
        // If DB insert fails, try to clean up the uploaded file
        await supabase.storage.from('attachments').remove([filePath])
        setError(insertError.message)
        setUploading(false)
        e.target.value = ''
        return
      }

      // Refresh list
      await fetchAttachments()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common:attachments.uploadFailed'))
    }

    setUploading(false)
    e.target.value = ''
  }

  const handleDownload = async (attachment: Attachment) => {
    setError(null)
    const { data, error: urlError } = await supabase.storage
      .from('attachments')
      .createSignedUrl(attachment.file_path, 3600)

    if (urlError || !data?.signedUrl) {
      setError(t('common:attachments.downloadFailed'))
      return
    }

    // Open in new tab
    window.open(data.signedUrl, '_blank')
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('attachments')
        .remove([deleteTarget.file_path])

      if (storageError) {
        setError(storageError.message)
        setDeleting(false)
        return
      }

      // Delete from DB
      const { error: dbError } = await supabase
        .from('attachments')
        .delete()
        .eq('id', deleteTarget.id)

      if (dbError) {
        setError(dbError.message)
        setDeleting(false)
        return
      }

      setDeleteTarget(null)
      await fetchAttachments()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common:attachments.deleteFailed'))
    }

    setDeleting(false)
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-blue-500" />
    return <FileText className="h-5 w-5 text-red-500" />
  }

  const canDelete = (attachment: Attachment) =>
    isCompanyAdmin || attachment.uploaded_by === user?.id

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <Paperclip className="h-5 w-5 text-gray-400" />
          {t('common:attachments.title')}
        </h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn btn-primary btn-sm"
        >
          <Upload className="h-4 w-4" />
          {uploading ? t('common:attachments.uploading') : t('common:attachments.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {error && <div className="mb-3"><Alert type="error" message={error} /></div>}

      {loading ? (
        <p className="py-4 text-center text-sm text-gray-500">...</p>
      ) : attachments.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{t('common:attachments.empty')}</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 hover:bg-gray-50"
            >
              {getFileIcon(att.mime_type)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{att.file_name}</p>
                <p className="text-xs text-gray-500">
                  {formatBytes(att.file_size)} · {formatDate(att.created_at)}
                  {att.uploader_name && ` · ${att.uploader_name}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDownload(att)}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  title={t('common:attachments.download')}
                >
                  <Download className="h-4 w-4" />
                </button>
                {canDelete(att) && (
                  <button
                    onClick={() => setDeleteTarget(att)}
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                    title={t('common:attachments.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('common:attachments.deleteTitle')}
        message={t('common:attachments.deleteConfirm')}
        confirmLabel={deleting ? t('common:attachments.deleting') : t('common:attachments.delete')}
        danger
      />
    </div>
  )
}
